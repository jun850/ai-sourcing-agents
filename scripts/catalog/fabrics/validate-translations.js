#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const contract=require('./contract');

function arg(flag,fallback=null){const index=process.argv.indexOf(flag);return index<0?fallback:process.argv[index+1];}
function main(){
  const file=path.resolve(arg('--translations','data/catalog-runs/apparelx-fabrics-10000/translations.json')),target=Number(arg('--target',4736)),output=path.resolve(arg('--output','data/catalog-runs/apparelx-fabrics-10000/translation-qa-report.json')),document=JSON.parse(fs.readFileSync(file,'utf8'));
  const errors=[],products=Object.entries(document.products||{}),suppliers=Object.entries(document.suppliers||{}),faqGroups=Object.entries(document.faqs||{});
  if(products.length!==target)errors.push(`expected ${target} products, found ${products.length}`);
  const cjk={ja:/[\u3040-\u30ff\u3400-\u9fff]/,zh:/[\u3400-\u9fff]/};
  for(const [key,copy] of [...products,...suppliers]){
    if(!contract.localeComplete(copy))errors.push(`${key}: localized name or description is blank`);
    for(const locale of ['ja','zh']){
      if(!cjk[locale].test(String(copy[locale]?.description||'')))errors.push(`${key}: ${locale} description has no localized script`);
      if(String(copy[locale]?.description||'').trim()===String(copy.en?.description||'').trim())errors.push(`${key}: ${locale} description equals English`);
      if(/ZXQ|QXZ|QKEEP/.test(`${copy[locale]?.name||''} ${copy[locale]?.description||''}`))errors.push(`${key}: ${locale} contains a translation marker`);
    }
  }
  let faqCount=0;for(const [productId,faqs] of faqGroups)for(const [faqKey,copy] of Object.entries(faqs)){faqCount+=1;for(const locale of ['en','ja','zh'])for(const field of ['question','answer'])if(!String(copy[locale]?.[field]||'').trim())errors.push(`${productId}/${faqKey}: ${locale}.${field} is blank`);}
  try{contract.assertSourceFree(document,'translated catalogue');}catch(error){errors.push(error.message);}
  const report={version:1,validated_at:new Date().toISOString(),products:products.length,suppliers:suppliers.length,faqs:faqCount,errors:errors.slice(0,200),passed:errors.length===0};
  fs.writeFileSync(output,`${JSON.stringify(report,null,2)}\n`);process.stdout.write(`${JSON.stringify(report,null,2)}\n`);if(!report.passed)process.exitCode=2;
}
if(require.main===module)try{main();}catch(error){process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;}
