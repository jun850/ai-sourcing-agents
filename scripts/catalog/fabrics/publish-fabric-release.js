#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

function arg(flag,fallback=null){const index=process.argv.indexOf(flag);return index<0?fallback:process.argv[index+1];}
function config(){const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!/^https:\/\/[a-z0-9-]+[.]supabase[.]co$/.test(url)||!key)throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply');return {url,key};}
async function request(cfg,route,options={}){const response=await fetch(`${cfg.url}${route}`,{...options,signal:options.signal||AbortSignal.timeout(30000),headers:{apikey:cfg.key,authorization:`Bearer ${cfg.key}`,...options.headers}});const body=await response.text();if(!response.ok)throw new Error(`${route} failed ${response.status}: ${body.slice(0,500)}`);return body?JSON.parse(body):null;}
function manifests(directory){return fs.readdirSync(directory).filter(name=>/^(?:supplier|product)-batch-\d+[.]json$/.test(name)).sort((a,b)=>{const ak=a.startsWith('supplier')?0:1,bk=b.startsWith('supplier')?0:1;return ak-bk||a.localeCompare(b);}).map(name=>path.join(directory,name));}
function runPublisher(file,apply){const args=['scripts/catalog/fabrics/publish-fabric-batch.js','--manifest',file];if(apply)args.push('--apply');const result=spawnSync(process.execPath,args,{cwd:process.cwd(),env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});if(result.stdout)process.stdout.write(result.stdout);if(result.status!==0)throw new Error(result.stderr||`publisher exited ${result.status}`);}
async function main(){
  const directory=path.resolve(arg('--directory','data/catalog-runs/apparelx-fabrics-10000/prepared-source-free')),apply=process.argv.includes('--apply'),files=manifests(directory);
  if(!files.length)throw new Error('no source-free batch manifests found');
  for(const file of files)runPublisher(file,false);
  if(!apply){process.stdout.write(`RELEASE DRY RUN OK ${files.length} batches\n`);return;}
  const cfg=config(),completed=[];
  try{for(const file of files){runPublisher(file,true);completed.push({file,document:JSON.parse(fs.readFileSync(file,'utf8'))});}const indexed=await request(cfg,'/functions/v1/algolia-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reindex_factories'})});if(!indexed?.ok)throw new Error('final supplier search indexing failed');}
  catch(error){
    process.stderr.write(`Release failed; rolling back ${completed.length} verified batches\n`);
    for(const item of completed.reverse()){
      await request(cfg,'/rest/v1/rpc/catalog_rollback_source_free_batch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_batch_id:item.document.batch_id,p_reason:String(error.message||error)})}).catch(()=>{});
      if(item.document.kind==='product')for(const entity of item.document.entities)for(const media of entity.media||[])for(const storagePath of [media.storage_path,media.thumb_storage_path].filter(Boolean))await request(cfg,`/storage/v1/object/catalog-media/${storagePath}`,{method:'DELETE'}).catch(()=>{});
    }
    await request(cfg,'/functions/v1/algolia-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'process_queue',limit:500})}).catch(()=>{});
    throw error;
  }
  process.stdout.write(`RELEASE LIVE VERIFIED ${completed.length} batches\n`);
}
if(require.main===module)main().catch(error=>{process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;});
