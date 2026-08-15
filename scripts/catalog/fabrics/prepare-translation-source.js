#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const contract=require('./contract');
const taxonomy=require('../../../js/catalog-taxonomy.js');

function arg(flag,fallback=null){const index=process.argv.indexOf(flag);return index<0?fallback:process.argv[index+1];}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
const SOURCE_CJK=/[\u3041-\u3096\u30a1-\u30fa\u3400-\u9fff]/;
function englishName(product){
  const raw=String(product.name||'').trim();if(!SOURCE_CJK.test(raw))return raw;
  const latin=raw.replace(/[\u3041-\u3096\u30a1-\u30fa\u3400-\u9fff・]/g,' ').replace(/[^A-Za-z0-9#&+./ -]+/g,' ').replace(/\s+/g,' ').trim(),construction=String(product.organization||taxonomy.label(taxonomy.classify(product),'en')).trim();
  return [latin,construction,/fabric/i.test(construction)?'':'fabric'].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}
function cleanDescription(product){
  const source=String(product.description||'').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^\*/.test(line)&&!/ordering|quantity field|number of rolls|delivery|stock/i.test(line)).join(' ');
  const fallback=`${englishName(product)} is a ${taxonomy.label(taxonomy.classify(product),'en').toLowerCase()} fabric. Contact the supplier to confirm current specifications and availability.`;
  const meaningful=source.length>=15&&/[A-Za-z]{3}/.test(source);
  const description=!meaningful||SOURCE_CJK.test(source)||/apparel[ -]?x|source[_ ]?(?:url|id|key|price|cost|contact)|provenance/i.test(source)?fallback:source;
  return description.length>700?`${description.slice(0,697).trimEnd()}…`:description;
}
function main(){
  const runDir=path.resolve(arg('--run-dir','data/catalog-runs/apparelx-fabrics-10000')),target=Number(arg('--target',4736)),output=path.resolve(arg('--output',path.join(runDir,'translation-source.json')));
  if(!Number.isInteger(target)||target<1)throw new Error('--target must be a positive integer');
  const products={},suppliers={},faqs={};let selected=0;
  for(const entry of fs.readdirSync(path.join(runDir,'products'),{withFileTypes:true}).filter(item=>item.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}))){
    const dir=path.join(runDir,'products',entry.name),productFile=path.join(dir,'product.json'),mediaFile=path.join(dir,'media-manifest.json');
    if(!fs.existsSync(productFile)||!fs.existsSync(mediaFile))continue;
    const product=readJson(productFile),media=readJson(mediaFile);if(contract.invalidReason(product,media))continue;
    const description=cleanDescription(product),name=englishName(product);
    products[product.sourceId]={en:{name,description}};
    const makerKey=contract.normalizeMaker(product.makerName);
    if(!suppliers[makerKey])suppliers[makerKey]={en:{name:String(product.makerName).trim(),description:`${String(product.makerName).trim()} is a fabric supplier represented in this catalogue. Contact the supplier to confirm current capabilities, specifications, minimums, and terms.`}};
    faqs[product.sourceId]={};
    for(const faq of contract.selectRelevantFaqs(product))faqs[product.sourceId][faq.local_faq_key]={en:{question:faq.question,answer:faq.answer}};
    selected+=1;if(selected===target)break;
  }
  if(selected!==target)throw new Error(`Translation source requires ${target} eligible products; found ${selected}`);
  const document={version:1,generated_at:new Date().toISOString(),target,products,suppliers,faqs};
  contract.assertSourceFree(document,'translation source');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,`${JSON.stringify(document,null,2)}\n`);
  process.stdout.write(`${JSON.stringify({output:path.relative(process.cwd(),output),products:Object.keys(products).length,suppliers:Object.keys(suppliers).length,faq_products:Object.values(faqs).filter(value=>Object.keys(value).length).length},null,2)}\n`);
}
if(require.main===module)try{main();}catch(error){process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;}
