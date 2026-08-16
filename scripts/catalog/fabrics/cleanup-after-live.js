#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
function arg(flag,fallback=null){const index=process.argv.indexOf(flag);return index<0?fallback:process.argv[index+1];}
function size(target){if(!fs.existsSync(target))return 0;const stat=fs.statSync(target);if(stat.isFile())return stat.size;return fs.readdirSync(target).reduce((sum,name)=>sum+size(path.join(target,name)),0);}
function main(){
  const runDir=path.resolve(arg('--run-dir','data/catalog-runs/apparelx-fabrics-10000')),receiptPath=arg('--production-receipt'),target=Number(arg('--target',4736)),apply=process.argv.includes('--apply');
  if(path.basename(runDir)!=='apparelx-fabrics-10000')throw new Error('cleanup is restricted to the apparelx-fabrics-10000 run directory');
  const retainedNames=new Set(['CATALOGUE_CONTEXT.md']);
  const targets=fs.readdirSync(runDir).filter(name=>!retainedNames.has(name)).map(name=>path.join(runDir,name));
  const before=targets.reduce((sum,item)=>sum+size(item),0),contextPath=path.join(runDir,'CATALOGUE_CONTEXT.md'),report={version:1,mode:apply?'apply':'dry-run',run_dir:runDir,targets:targets.map(item=>path.relative(runDir,item)),bytes_reclaimable:before,retained:[...retainedNames]};
  if(apply){
    if(!receiptPath)throw new Error('--apply requires --production-receipt');
    if(!fs.existsSync(contextPath)||fs.statSync(contextPath).size<100)throw new Error('--apply requires a complete CATALOGUE_CONTEXT.md');
    const receipt=JSON.parse(fs.readFileSync(path.resolve(receiptPath),'utf8'));
    if(receipt.target_products!==target||receipt.active_products!==target||receipt.product_batch_count!==target||receipt.live_smoke_passed!==true||receipt.source_privacy_passed!==true||receipt.translations_passed!==true||receipt.price_contract_passed!==true||receipt.supplier_assignments_passed!==true||!Array.isArray(receipt.batch_ids)||!receipt.batch_ids.length)throw new Error(`production receipt does not prove ${target} live, translated, priced, supplier-assigned products and passed QA/privacy gates`);
    for(const target of targets)fs.rmSync(target,{recursive:true,force:true});
    Object.assign(report,{deleted_at:new Date().toISOString(),production_batch_ids:receipt.batch_ids,bytes_reclaimed:before});
    fs.appendFileSync(contextPath,`\n\n## Local cleanup receipt\n\n- Deleted at: ${report.deleted_at}\n- Bytes reclaimed: ${before}\n- Production release: ${receipt.release_id}\n- Verified product batches: ${receipt.batch_ids.length}\n`);
  }
  process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
}
if(require.main===module)try{main();}catch(error){process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;}
