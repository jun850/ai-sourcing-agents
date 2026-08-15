#!/usr/bin/env node
'use strict';

const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');const contract=require('./contract');
function arg(flag,fallback=null){const index=process.argv.indexOf(flag);return index<0?fallback:process.argv[index+1];}
function stable(value){if(Array.isArray(value))return value.map(stable);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));}
function sha(value){return crypto.createHash('sha256').update(Buffer.isBuffer(value)?value:JSON.stringify(stable(value))).digest('hex');}
function config(){const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY,storageBudgetBytes=Number(process.env.ATELIX_CATALOG_STORAGE_BUDGET_BYTES);if(!/^https:\/\/[a-z0-9-]+[.]supabase[.]co$/.test(url)||!key)throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply');if(!Number.isSafeInteger(storageBudgetBytes)||storageBudgetBytes<=0)throw new Error('ATELIX_CATALOG_STORAGE_BUDGET_BYTES must be a positive safe integer for --apply');return {url,key,storageBudgetBytes};}
async function request(cfg,route,options={}){const response=await fetch(`${cfg.url}${route}`,{...options,headers:{apikey:cfg.key,authorization:`Bearer ${cfg.key}`,...options.headers}});const text=await response.text();if(!response.ok)throw new Error(`${route} failed ${response.status}: ${text.slice(0,800)}`);return text?JSON.parse(text):null;}
function mediaFile(manifestFile,storagePath){return path.join(path.dirname(path.resolve(manifestFile)),'media',storagePath);}
async function mapLimit(items,limit,worker){let next=0;const runners=Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const index=next;next+=1;await worker(items[index],index);}});await Promise.all(runners);}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function verifyAlgoliaObject({url,headers,objectId,fetchImpl=fetch,wait=sleep,attempts=10}){
  let status=0;
  for(let attempt=0;attempt<attempts;attempt+=1){
    const response=await fetchImpl(url,{headers,cache:'no-store'});status=response.status;
    if(response.ok)return;
    if(attempt+1<attempts)await wait(Math.min(500*(2**attempt),4000));
  }
  throw new Error(`Algolia read-back failed for ${objectId} after ${attempts} attempts (status ${status})`);
}
function validate(document,manifestFile){
  if(document.version!==1||!['supplier','product'].includes(document.kind)||!Number.isInteger(document.sequence_no)||document.sequence_no<1||!/^[0-9a-f-]{36}$/.test(document.release_id||''))throw new Error('invalid source-free batch header');
  if(!Array.isArray(document.entities)||document.entities.length<1||document.entities.length>50)throw new Error('batch must contain 1..50 entities');
  if(!Number.isSafeInteger(document.storage_bytes)||document.storage_bytes<0)throw new Error('batch storage_bytes must be a non-negative safe integer');
  if(!/^[0-9a-f-]{36}$/.test(document.batch_id||'')||!/^[0-9a-f]{64}$/.test(document.manifest_sha256||'')||!/^[0-9a-f]{40}$/.test(document.deployed_git_sha||''))throw new Error('invalid batch IDs or release SHA');
  const base={version:document.version,release_id:document.release_id,kind:document.kind,sequence_no:document.sequence_no,deployed_git_sha:document.deployed_git_sha,storage_bytes:document.storage_bytes,entities:document.entities};
  if(sha(base)!==document.manifest_sha256)throw new Error('manifest SHA does not match canonical batch content');
  contract.assertSourceFree(document);
  if(document.kind==='product'){
    let storageBytes=0;
    for(const entity of document.entities){
      if(!entity.id||!entity.factory_id||!entity.product||!Array.isArray(entity.media)||entity.media.length<1||entity.media.length>4)throw new Error('invalid product entity');
      if(!['fixed','quote'].includes(entity.product.pricing_mode)||(entity.product.pricing_mode==='fixed'&&!(Number(entity.product.price)>0))||(entity.product.pricing_mode==='quote'&&Number(entity.product.price)!==0))throw new Error('invalid public product price');
      if(!Array.isArray(entity.prices)||entity.prices.length!==2||new Set(entity.prices.map(item=>item.currency)).size!==2||!entity.prices.some(item=>item.currency==='USD')||!entity.prices.some(item=>item.currency==='JPY'))throw new Error('product requires the existing USD and JPY catalogue price rows');
      for(const price of entity.prices){const calculated=Math.ceil((Number(price.base_amount)*Number(price.fx_rate)*(1+Number(price.markup_bps)/10000)-Number.EPSILON)/Number(price.rounding_increment))*Number(price.rounding_increment);if(!(Number(price.base_amount)>0)||!(Number(price.fx_rate)>0)||Number(price.markup_bps)<2000||Math.abs(calculated-Number(price.catalog_amount))>.001)throw new Error(`invalid ${price.currency} catalogue price row`);}
      if(Number(entity.prices.find(item=>item.currency==='USD').catalog_amount)!==Number(entity.product.price))throw new Error('product compatibility price must match its USD catalogue price');
      for(const [position,media] of entity.media.entries()){
        if(media.position!==position)throw new Error('product media positions must be contiguous and ordered');
        for(const key of ['storage_path','thumb_storage_path','sha256','thumb_sha256'])if(!media[key])throw new Error(`media missing ${key}`);
        if(!media.storage_path.endsWith(`/${media.sha256}-1600.webp`)||!media.thumb_storage_path.endsWith(`/${media.thumb_sha256}-640.webp`))throw new Error('media paths must be content addressed by their own hashes');
        if(!['en','ja','zh'].every(locale=>String(media.alt_i18n?.[locale]||'').trim()))throw new Error('media alternative text must be complete in EN, JA, and ZH');
        const full=fs.readFileSync(mediaFile(manifestFile,media.storage_path)),thumb=fs.readFileSync(mediaFile(manifestFile,media.thumb_storage_path));
        if(sha(full)!==media.sha256||full.length!==media.bytes)throw new Error(`full media hash or byte count mismatch: ${media.storage_path}`);
        if(sha(thumb)!==media.thumb_sha256||thumb.length!==media.thumb_bytes)throw new Error(`thumbnail hash or byte count mismatch: ${media.thumb_storage_path}`);
        storageBytes+=full.length+thumb.length;
      }
    }
    if(storageBytes!==document.storage_bytes)throw new Error(`batch storage byte total mismatch: expected ${document.storage_bytes}, found ${storageBytes}`);
  }else if(document.storage_bytes!==0)throw new Error('supplier batches cannot declare media storage bytes');
  return document;
}
async function uploadMedia(cfg,document,manifestFile,uploaded=[]){
  const origin=`${cfg.url}/storage/v1/object/public/catalog-media`;
  const objects=[];for(const entity of document.entities)for(const media of entity.media||[]){
    if(media.public_url!==`${origin}/${media.storage_path}`||media.thumb_url!==`${origin}/${media.thumb_storage_path}`)throw new Error(`manifest media URL does not match production project: ${media.storage_path}`);
    objects.push({storagePath:media.storage_path,hash:media.sha256,bytes:media.bytes},{storagePath:media.thumb_storage_path,hash:media.thumb_sha256,bytes:media.thumb_bytes});
  }
  await mapLimit(objects,8,async object=>{
      const body=fs.readFileSync(mediaFile(manifestFile,object.storagePath));
      const response=await fetch(`${cfg.url}/storage/v1/object/catalog-media/${object.storagePath}`,{method:'POST',headers:{apikey:cfg.key,authorization:`Bearer ${cfg.key}`,'content-type':'image/webp','cache-control':'31536000, immutable','x-upsert':'false'},body});
      if(!response.ok&&response.status!==409)throw new Error(`storage upload failed ${response.status}: ${object.storagePath}`);
      if(response.ok)uploaded.push(object.storagePath);
      const live=await fetch(`${origin}/${object.storagePath}`,{cache:'no-store'}),liveBytes=Buffer.from(await live.arrayBuffer());
      if(!live.ok||liveBytes.length!==object.bytes||liveBytes[0]!==0x52||liveBytes.toString('ascii',8,12)!=='WEBP'||sha(liveBytes)!==object.hash)throw new Error(`live media verification failed: ${object.storagePath}`);
  });
  return uploaded;
}
async function syncSearch(cfg,document){
  const sync=await request(cfg,'/functions/v1/algolia-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'process_queue',limit:500})});if(!sync?.ok||Number(sync.failed||0)>0)throw new Error(`Algolia sync failed: ${JSON.stringify(sync)}`);
  if(document.kind==='supplier')return;
  const publicConfig=await request(cfg,'/functions/v1/algolia-public-config'),index=document.kind==='supplier'?publicConfig?.indices?.factories:publicConfig?.indices?.products;if(!publicConfig?.appId||!publicConfig?.apiKey||!index)throw new Error('Algolia public configuration incomplete');
  await mapLimit(document.entities,12,async entity=>{const objectId=document.kind==='supplier'?entity.slug:entity.product.sku;await verifyAlgoliaObject({url:`https://${publicConfig.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(index)}/${encodeURIComponent(objectId)}`,headers:{'X-Algolia-Application-Id':publicConfig.appId,'X-Algolia-API-Key':publicConfig.apiKey},objectId});});
}
async function liveReadback(cfg,document){if(document.kind==='supplier'){const ids=document.entities.map(entity=>entity.id).join(','),rows=await request(cfg,`/rest/v1/factories?id=in.(${ids})&select=id,slug,verify_state,archived_at`),byId=new Map((rows||[]).map(row=>[row.id,row]));for(const entity of document.entities){const row=byId.get(entity.id);if(!row||row.slug!==entity.slug||row.verify_state!=='verified'||row.archived_at)throw new Error(`supplier database read-back failed: ${entity.slug}`);}}else await mapLimit(document.entities,12,async entity=>{const row=await request(cfg,'/rest/v1/rpc/public_get_product',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_sku:entity.product.sku,p_locale:'en'})});if(!row||row.sku!==entity.product.sku||!row.media?.length)throw new Error(`public product read-back failed: ${entity.product.sku}`);});}
async function main(){
  const file=arg('--manifest');if(!file)throw new Error('Usage: publish-fabric-batch.js --manifest FILE [--apply]');const document=validate(JSON.parse(fs.readFileSync(path.resolve(file),'utf8')),file),apply=process.argv.includes('--apply');
  if(!apply){process.stdout.write(`DRY RUN OK ${document.batch_id} ${document.kind} ${document.entities.length}\n`);return;}
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(head!==document.deployed_git_sha||process.env.ATELIX_DEPLOYED_GIT_SHA!==head)throw new Error('manifest, local HEAD, and ATELIX_DEPLOYED_GIT_SHA must match');
  const cfg=config();let uploadedPaths=[],finalized=false;
  try{
    if(document.kind==='product'){
      const usage=await request(cfg,'/rest/v1/rpc/catalog_storage_usage',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),usedBytes=Number(usage?.used_bytes||0);
      if(!Number.isSafeInteger(usedBytes)||usedBytes<0||usedBytes+document.storage_bytes>cfg.storageBudgetBytes)throw new Error(`catalog storage budget exceeded: ${usedBytes} used + ${document.storage_bytes} batch > ${cfg.storageBudgetBytes}`);
      await uploadMedia(cfg,document,file,uploadedPaths);
    }
    await request(cfg,'/rest/v1/rpc/catalog_finalize_source_free_batch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_batch_id:document.batch_id,p_release_id:document.release_id,p_entity_kind:document.kind,p_sequence_no:document.sequence_no,p_manifest_sha256:document.manifest_sha256,p_deployed_git_sha:document.deployed_git_sha,p_storage_bytes:document.storage_bytes,p_entities:document.entities})});finalized=true;
    await syncSearch(cfg,document);await liveReadback(cfg,document);
    const receipt=await request(cfg,'/rest/v1/rpc/catalog_verify_source_free_batch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_batch_id:document.batch_id})});
    process.stdout.write(`LIVE VERIFIED ${receipt.id} ${receipt.entity_kind} ${receipt.entity_count}\n`);
  }catch(error){
    if(finalized){await request(cfg,'/rest/v1/rpc/catalog_rollback_source_free_batch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_batch_id:document.batch_id,p_reason:String(error.message||error)})}).catch(()=>{});await syncSearch(cfg,document).catch(()=>{});}
    for(const storagePath of uploadedPaths)await request(cfg,`/storage/v1/object/catalog-media/${storagePath}`,{method:'DELETE'}).catch(()=>{});
    throw error;
  }
}
if(require.main===module)main().catch(error=>{process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;});
module.exports={validate,verifyAlgoliaObject};
