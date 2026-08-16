#!/usr/bin/env node
'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const contract=require('./contract');
const pricing=require('./pricing');

const DEFAULT_RUN='data/catalog-runs/apparelx-fabrics-10000';
function arg(flag,fallback=null){const index=process.argv.indexOf(flag);return index<0?fallback:process.argv[index+1];}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function removeBatchManifests(output,kind){if(!fs.existsSync(output))return 0;let removed=0;for(const name of fs.readdirSync(output)){if(new RegExp(`^${kind}-batch-\\d+[.]json$`).test(name)){fs.unlinkSync(path.join(output,name));removed+=1;}}return removed;}
function transformedThumbUrl(mediaOrigin,storagePath){return `${mediaOrigin.replace('/storage/v1/object/public/','/storage/v1/render/image/public/')}/${storagePath}?width=640&quality=76&resize=contain`;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));}
function digest(value){return crypto.createHash('sha256').update(Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(stable(value))).digest('hex');}
function translations(file){if(!file||!fs.existsSync(file))return {products:{},suppliers:{},faqs:{}};const value=readJson(file);return {products:value.products||{},suppliers:value.suppliers||{},faqs:value.faqs||{}};}
function productDirs(runDir){return fs.readdirSync(path.join(runDir,'products'),{withFileTypes:true}).filter(item=>item.isDirectory()).map(item=>path.join(runDir,'products',item.name)).sort();}
function existingFactoryMap(file){
  if(!file||!fs.existsSync(file))return new Map();
  const document=readJson(file),items=document.factories||document||[],byName=new Map();
  for(const factory of items){
    const key=contract.normalizeMaker(factory.name);
    if(!key)continue;
    if(byName.has(key)&&byName.get(key).id!==factory.id)throw new Error(`Factory snapshot contains duplicate normalized name: ${factory.name}`);
    byName.set(key,factory);
  }
  byName.snapshot={privileged:document.privileged===true,generated_at:document.generated_at||null};
  return byName;
}
function applySupplierAliases(factoryMap,file){
  if(!file||!fs.existsSync(file))return;
  const aliases=readJson(file),bySlug=new Map([...factoryMap.values()].map(factory=>[factory.slug,factory]));
  for(const [maker,slug] of Object.entries(aliases)){
    const key=contract.normalizeMaker(maker),factory=bySlug.get(slug);
    if(!factory)throw new Error(`Supplier alias points to missing production slug: ${maker} -> ${slug}`);
    if(factoryMap.has(key)&&factoryMap.get(key).id!==factory.id)throw new Error(`Supplier alias conflicts with exact production name: ${maker}`);
    factoryMap.set(key,factory);
  }
}
function writeImmutable(file,buffer,expectedHash){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(fs.existsSync(file)){
    if(digest(fs.readFileSync(file))!==expectedHash)throw new Error(`Existing optimized media hash mismatch: ${file}`);
    return;
  }
  fs.writeFileSync(file,buffer,{flag:'wx'});
}
async function optimizeMedia(dir,productId,manifest,outputDir,build,mediaOrigin,copy,maxImages,thumbnailMode){
  const sourceHashes=new Set(),selected=[];
  for(const image of manifest.images||[]){
    const key=String(image.sha256||image.localPath||'');
    if(!key||sourceHashes.has(key))continue;
    sourceHashes.add(key);selected.push(image);if(selected.length===maxImages)break;
  }
  const values=[],optimizedHashes=new Set();let deduplicated=Math.max(0,(manifest.images||[]).slice(0,4).length-selected.length);
  for(let position=0;position<selected.length;position+=1){
    const item=selected[position],input=path.resolve(path.dirname(path.dirname(dir)),item.localPath);
    if(!fs.existsSync(input))throw new Error(`Missing media ${input}`);
    const base={role:position===0?'sample_card':position===1?'texture':position===2?'drape':'detail',position};
    if(!build){values.push({...base,status:'would_optimize',local_input:path.relative(process.cwd(),input)});continue;}
    const full=await sharp(input,{failOn:'error'}).rotate().toColourspace('srgb').resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:80,effort:6,smartSubsample:true}).toBuffer({resolveWithObject:true});
    const fullHash=digest(full.data);
    if(optimizedHashes.has(fullHash)){deduplicated+=1;continue;}
    optimizedHashes.add(fullHash);
    const productPath=`products/${productId}`,fullPath=`${productPath}/${fullHash}-1600.webp`;
    writeImmutable(path.join(outputDir,'media',fullPath),full.data,fullHash);
    if(thumbnailMode==='transform'){
      values.push({...base,position:values.length,public_url:`${mediaOrigin}/${fullPath}`,thumb_url:transformedThumbUrl(mediaOrigin,fullPath),storage_path:fullPath,thumb_storage_path:null,width:full.info.width,height:full.info.height,bytes:full.data.length,sha256:fullHash,thumb_bytes:null,thumb_sha256:null,alt_i18n:contract.localizedAlt(copy,base.role)});
    }else{
      const thumb=await sharp(input,{failOn:'error'}).rotate().toColourspace('srgb').resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).webp({quality:76,effort:6,smartSubsample:true}).toBuffer({resolveWithObject:true});
      const thumbHash=digest(thumb.data),thumbPath=`${productPath}/${thumbHash}-640.webp`;
      writeImmutable(path.join(outputDir,'media',thumbPath),thumb.data,thumbHash);
      values.push({...base,position:values.length,public_url:`${mediaOrigin}/${fullPath}`,thumb_url:`${mediaOrigin}/${thumbPath}`,storage_path:fullPath,thumb_storage_path:thumbPath,width:full.info.width,height:full.info.height,bytes:full.data.length,sha256:fullHash,thumb_bytes:thumb.data.length,thumb_sha256:thumbHash,alt_i18n:contract.localizedAlt(copy,base.role)});
    }
  }
  return {values,deduplicated};
}
function localizedFaqs(localFaqs,translationDoc){
  return localFaqs.map((faq,index)=>{const translated=translationDoc?.[faq.local_faq_key]||{};return {question_i18n:{en:faq.question,ja:translated.ja?.question||'',zh:translated.zh?.question||''},answer_i18n:{en:faq.answer,ja:translated.ja?.answer||'',zh:translated.zh?.answer||''},sort_order:index,active:true};});
}
async function prepare(options={}){
  const runDir=path.resolve(options.runDir||DEFAULT_RUN),output=path.resolve(options.output||path.join(runDir,'prepared-source-free'));
  const translationDoc=translations(options.translations),factoryMap=existingFactoryMap(options.factories),build=Boolean(options.build);
  applySupplierAliases(factoryMap,options.supplierAliases||path.join(__dirname,'supplier-aliases.json'));
  const storageBudgetMb=Number(options.storageBudgetMb);
  const maxImages=Number(options.maxImages||4);
  const productBatchSize=Number(options.batchSize||50);
  const thumbnailMode=String(options.thumbnailMode||'stored');
  const target=Number(options.target||4736),usdJpy=Number(options.usdJpy||pricing.DEFAULT_USD_JPY),fxSnapshotId=String(options.fxSnapshotId||'atelix-static-jpy-150');
  const supabaseUrl=String(options.supabaseUrl||process.env.SUPABASE_URL||'').replace(/\/$/,'');
  if(build&&!/^https:\/\/[a-z0-9-]+[.]supabase[.]co$/.test(supabaseUrl))throw new Error('--supabase-url must be the production Supabase project URL');
  if(build&&!options.factories)throw new Error('--build requires a current production factory snapshot via --factories');
  if(build&&factoryMap.snapshot?.privileged!==true)throw new Error('--build requires a privileged factory snapshot that includes archived and unverified slug conflicts');
  if(build&&(!Number.isFinite(storageBudgetMb)||storageBudgetMb<=0))throw new Error('--build requires a positive --storage-budget-mb');
  if(!Number.isInteger(maxImages)||maxImages<1||maxImages>4)throw new Error('--max-images must be an integer from 1 to 4');
  if(!Number.isInteger(productBatchSize)||productBatchSize<1||productBatchSize>50)throw new Error('--batch-size must be an integer from 1 to 50');
  if(!['stored','transform'].includes(thumbnailMode))throw new Error('--thumbnail-mode must be stored or transform');
  if(!Number.isInteger(target)||target<1)throw new Error('--target must be a positive integer');
  const mediaOrigin=build?`${supabaseUrl}/storage/v1/object/public/catalog-media`:'';
  const eligible=[],excluded=[],supplierByName=new Map(),missingTranslations=[],supplierConflicts=[];
  for(const dir of productDirs(runDir)){
    const productPath=path.join(dir,'product.json'),mediaPath=path.join(dir,'media-manifest.json');
    if(!fs.existsSync(productPath)||!fs.existsSync(mediaPath)){excluded.push({local_key:path.basename(dir),reason:'incomplete_archive'});continue;}
    const product=readJson(productPath),mediaManifest=readJson(mediaPath);
    const reason=contract.invalidReason(product,mediaManifest);if(reason){excluded.push({local_key:path.basename(dir),reason});continue;}
    eligible.push({dir,product,mediaManifest,localKey:path.basename(dir)});
  }
  const selectedCandidates=eligible.slice(0,target),reserveCount=Math.max(0,eligible.length-selectedCandidates.length),planned=[];
  const existingSlugs=new Map([...factoryMap.values()].map(factory=>[factory.slug,factory]));
  for(const {dir,product,mediaManifest,localKey} of selectedCandidates){
    const productId=contract.uuidFromText(`atelix-product:${product.sourceId}`),makerKey=contract.normalizeMaker(product.makerName);
    const productCopy=translationDoc.products[product.sourceId]||{};
    const supplierMetadata=translationDoc.suppliers[makerKey]||translationDoc.suppliers[product.makerName]||{};
    if(!contract.localeComplete(productCopy))missingTranslations.push({kind:'product',local_key:localKey,required:['en.name','en.description','ja.name','ja.description','zh.name','zh.description']});
    if(!supplierByName.has(makerKey)){
      const existing=factoryMap.get(makerKey);
      if(existing){
        if(!/^[0-9a-f-]{36}$/.test(existing.id||'')||!existing.slug||existing.archived_at||existing.verify_state!=='verified')supplierConflicts.push({local_key:makerKey,reason:'exact_existing_supplier_is_not_active_verified'});
        const existingCopy=contract.localeCopy(supplierMetadata);existingCopy.en.name=existing.name;
        if(!contract.localeComplete(existingCopy))missingTranslations.push({kind:'supplier',local_key:makerKey,required:['en.name','en.description','ja.name','ja.description','zh.name','zh.description'],error:'existing supplier localized update is incomplete'});
        supplierByName.set(makerKey,{id:existing.id,slug:existing.slug,name:existing.name,type:existing.type,region:existing.region||null,loc:existing.loc||null,verify_state:'verified',copy_i18n:existingCopy,initials:String(existing.name).split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase(),owner_profile_id:existing.owner_profile_id||null,match:'exact_existing',publish:true,publish_new:false});
      }else{
        let supplier=null;
        try{supplier=contract.publicSupplier(product,supplierMetadata);}catch(error){
          missingTranslations.push({kind:'supplier',local_key:makerKey,required:['en.name','en.description','ja.name','ja.description','zh.name','zh.description'],error:error.message});
          supplier={id:contract.uuidFromText(`atelix-fabric-mill:${makerKey}`),slug:contract.makerSlug(product.makerName),name:product.makerName};
        }
        const slugOwner=existingSlugs.get(supplier.slug);
        if(slugOwner&&contract.normalizeMaker(slugOwner.name)!==makerKey)supplierConflicts.push({local_key:makerKey,reason:'slug_conflicts_with_existing_supplier',slug:supplier.slug});
        supplierByName.set(makerKey,{...supplier,match:'auto_created_verified',publish:true,publish_new:true});
      }
    }
    const localFaqs=contract.selectRelevantFaqs(product),faqs=localizedFaqs(localFaqs,translationDoc.faqs[product.sourceId]);
    if(faqs.some(faq=>['ja','zh'].some(locale=>!faq.question_i18n[locale]||!faq.answer_i18n[locale])))missingTranslations.push({kind:'faq',local_key:localKey,count:faqs.length});
    planned.push({dir,product,mediaManifest,productId,productCopy,faqs,makerKey,pricing:pricing.publicPricing(product,{usdJpy,fxSnapshotId})});
  }
  const skuCount=new Set(planned.map(item=>contract.skuFromKey(item.product.sourceId))).size;
  const publicPrices=planned.map(item=>item.pricing.usd),publicJpyPrices=planned.map(item=>item.pricing.jpy);
  const metadataFields=['material','specification','subcategory','useApplications','season','handling'],metadataCompleteness=Object.fromEntries(metadataFields.map(field=>[field,planned.filter(item=>String(item.product[field]||'').trim()).length])),constructionCounts={};
  for(const item of planned){const slug=require('../../../js/catalog-taxonomy.js').classify(item.product);constructionCounts[slug]=(constructionCounts[slug]||0)+1;}
  const supplierAssignments=[...supplierByName.entries()].map(([makerKey,item])=>({maker_key:makerKey,factory_id:item.id,slug:item.slug,name:item.name,assignment:item.match,publish_new_supplier:item.publish_new===true,public_metadata_complete:item.publish?contract.localeComplete(item.copy_i18n||{}):true,location_disclosed:Boolean(item.region&&item.loc)}));
  const report={version:1,mode:build?'build':'dry-run',target,scanned:eligible.length+excluded.length,eligible:eligible.length,selected:planned.length,reserve_count:reserveCount,excluded_count:excluded.length,replacement_needed:Math.max(0,target-planned.length),unique_skus:skuCount,priced_products:publicPrices.length,quote_only_products:0,public_price_usd_min:publicPrices.length?Math.min(...publicPrices):null,public_price_usd_max:publicPrices.length?Math.max(...publicPrices):null,public_price_jpy_min:publicJpyPrices.length?Math.min(...publicJpyPrices):null,public_price_jpy_max:publicJpyPrices.length?Math.max(...publicJpyPrices):null,verified_input_prices:planned.filter(item=>item.pricing.origin==='verified_input').length,estimated_band_prices:planned.filter(item=>item.pricing.origin==='atelix_band').length,pricing_snapshot:{fx_snapshot_id:fxSnapshotId,usd_jpy:usdJpy},suppliers:supplierByName.size,existing_supplier_assignments:[...supplierByName.values()].filter(item=>item.match==='exact_existing').length,new_suppliers:[...supplierByName.values()].filter(item=>item.publish_new).length,missing_translation_entities:missingTranslations.length,supplier_conflicts:supplierConflicts.length,metadata_complete_counts:metadataCompleteness,ready_for_active_publication:false};
  const writeReadiness=()=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'readiness-report.json'),`${JSON.stringify({report,excluded,missingTranslations,supplierConflicts},null,2)}\n`);fs.writeFileSync(path.join(output,'supplier-assignment-report.json'),`${JSON.stringify({version:1,production_snapshot_privileged:factoryMap.snapshot?.privileged===true,assignments:supplierAssignments},null,2)}\n`);fs.writeFileSync(path.join(output,'catalog-metadata-report.json'),`${JSON.stringify({version:1,selected_products:planned.length,complete_counts:metadataCompleteness,construction_counts:constructionCounts},null,2)}\n`);fs.writeFileSync(path.join(output,'pricing-report.json'),`${JSON.stringify({version:1,fx_snapshot_id:fxSnapshotId,usd_jpy:usdJpy,products:planned.map(item=>({sku:contract.skuFromKey(item.product.sourceId),pricing_mode:item.pricing.pricing_mode,usd:item.pricing.usd,jpy:item.pricing.jpy,origin:item.pricing.origin,band:item.pricing.band,gsm:item.pricing.gsm??null}))},null,2)}\n`);};
  writeReadiness();
  if(build){
    if(planned.length!==target)throw new Error(`Exactly ${target} eligible products required; found ${planned.length}. Add ${target-planned.length} replacements.`);
    if(missingTranslations.length)throw new Error(`${missingTranslations.length} translation records are incomplete`);
    if(supplierConflicts.length)throw new Error(`${supplierConflicts.length} supplier assignments conflict with the production snapshot`);
    const gitCommitSha=String(options.gitCommitSha||'');if(!/^[0-9a-f]{40}$/.test(gitCommitSha))throw new Error('--git-commit-sha must be a deployed full lowercase SHA');
    const releaseId=contract.uuidFromText(`source-free-release:${gitCommitSha}:${digest(planned.map(item=>item.productId))}`);
    const accepted=[];let deduplicatedImages=0;
    for(const item of planned){
      const optimized=await optimizeMedia(item.dir,item.productId,item.mediaManifest,output,true,mediaOrigin,item.productCopy,maxImages,thumbnailMode);deduplicatedImages+=optimized.deduplicated;
      accepted.push({id:item.productId,factory_id:supplierByName.get(item.makerKey).id,product:contract.publicProduct(item.product,item.productCopy,optimized.values,item.pricing),prices:pricing.catalogPriceRows(item.pricing),media:optimized.values,faqs:item.faqs});
    }
    const mediaItems=accepted.flatMap(item=>item.media),fullBytes=mediaItems.reduce((sum,item)=>sum+item.bytes,0),thumbnailBytes=mediaItems.reduce((sum,item)=>sum+Number(item.thumb_bytes||0),0),storageBytes=fullBytes+thumbnailBytes,storageBudgetBytes=Math.floor(storageBudgetMb*1024*1024);
    Object.assign(report,{max_images_per_product:maxImages,thumbnail_mode:thumbnailMode,optimized_media_objects:mediaItems.length*(thumbnailMode==='stored'?2:1),optimized_full_bytes:fullBytes,optimized_thumbnail_bytes:thumbnailBytes,optimized_storage_bytes:storageBytes,storage_budget_bytes:storageBudgetBytes,storage_budget_remaining_bytes:storageBudgetBytes-storageBytes,deduplicated_images:deduplicatedImages,ready_for_active_publication:storageBytes<=storageBudgetBytes});writeReadiness();
    if(storageBytes>storageBudgetBytes)throw new Error(`Optimized media requires ${storageBytes} bytes, exceeding the ${storageBudgetBytes}-byte storage budget`);
    const suppliers=[...supplierByName.values()].filter(item=>item.publish).map(({match,publish,publish_new,...supplier})=>supplier);
    contract.assertSourceFree({suppliers,products:accepted});
    const writeBatches=(kind,items,batchSize)=>{removeBatchManifests(output,kind);for(let offset=0;offset<items.length;offset+=batchSize){const entities=items.slice(offset,offset+batchSize),storage_bytes=kind==='product'?entities.flatMap(entity=>entity.media).reduce((sum,item)=>sum+item.bytes+Number(item.thumb_bytes||0),0):0,document={version:1,release_id:releaseId,kind,sequence_no:offset/batchSize+1,deployed_git_sha:gitCommitSha,storage_bytes,entities};document.manifest_sha256=digest(document);document.batch_id=contract.uuidFromText(`source-free-batch:${document.manifest_sha256}`);contract.assertSourceFree(document);fs.writeFileSync(path.join(output,`${kind}-batch-${String(document.sequence_no).padStart(3,'0')}.json`),`${JSON.stringify(document,null,2)}\n`);}};
    writeBatches('supplier',suppliers,50);writeBatches('product',accepted,productBatchSize);
    fs.writeFileSync(path.join(output,'release-plan.json'),`${JSON.stringify({version:1,release_id:releaseId,deployed_git_sha:gitCommitSha,target_products:target,product_batch_size:productBatchSize,thumbnail_mode:thumbnailMode,pricing:{fx_snapshot_id:fxSnapshotId,usd_jpy:usdJpy,verified_input_prices:report.verified_input_prices,estimated_band_prices:report.estimated_band_prices},existing_supplier_assignments:report.existing_supplier_assignments,new_suppliers:report.new_suppliers,product_batches:Math.ceil(accepted.length/productBatchSize),supplier_batches:Math.ceil(suppliers.length/50),storage:{objects:report.optimized_media_objects,full_bytes:fullBytes,thumbnail_bytes:thumbnailBytes,total_bytes:storageBytes,budget_bytes:storageBudgetBytes,remaining_bytes:storageBudgetBytes-storageBytes}},null,2)}\n`);
  }
  return report;
}

async function main(){const report=await prepare({runDir:arg('--run-dir',DEFAULT_RUN),output:arg('--output'),translations:arg('--translations'),factories:arg('--factories'),supplierAliases:arg('--supplier-aliases',path.join(__dirname,'supplier-aliases.json')),gitCommitSha:arg('--git-commit-sha'),supabaseUrl:arg('--supabase-url'),storageBudgetMb:arg('--storage-budget-mb'),maxImages:arg('--max-images',4),batchSize:arg('--batch-size',50),thumbnailMode:arg('--thumbnail-mode','stored'),target:arg('--target',4736),usdJpy:arg('--usd-jpy',pricing.DEFAULT_USD_JPY),fxSnapshotId:arg('--fx-snapshot-id','atelix-static-jpy-150'),build:process.argv.includes('--build')});process.stdout.write(`${JSON.stringify(report,null,2)}\n`);}
if(require.main===module)main().catch(error=>{process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;});
module.exports={prepare,digest,removeBatchManifests,transformedThumbUrl};
