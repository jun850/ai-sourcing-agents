#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
function arg(flag,fallback=null){const index=process.argv.indexOf(flag);return index<0?fallback:process.argv[index+1];}
function read(file){return JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));}
function mergeNode(ja,zh){
  if(ja&&zh&&ja.en&&zh.en)return {en:ja.en,ja:ja.ja,zh:zh.zh};
  if(Array.isArray(ja)||Array.isArray(zh))throw new Error('translation documents must use keyed objects');
  const result={};for(const key of new Set([...Object.keys(ja||{}),...Object.keys(zh||{})]))result[key]=mergeNode(ja?.[key],zh?.[key]);return result;
}
function main(){const ja=read(arg('--ja')),zh=read(arg('--zh')),output=path.resolve(arg('--output','data/catalog-runs/apparelx-fabrics-10000/translations.json'));const merged={version:1,source_generated_at:ja.source_generated_at||zh.source_generated_at,products:mergeNode(ja.products,zh.products),suppliers:mergeNode(ja.suppliers,zh.suppliers),faqs:mergeNode(ja.faqs,zh.faqs)};fs.writeFileSync(output,`${JSON.stringify(merged,null,2)}\n`);process.stdout.write(`${JSON.stringify({output:path.relative(process.cwd(),output),products:Object.keys(merged.products).length,suppliers:Object.keys(merged.suppliers).length},null,2)}\n`);}
if(require.main===module)try{main();}catch(error){process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;}
