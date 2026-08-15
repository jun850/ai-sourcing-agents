#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const contract=require('./contract');

const DEFAULT_RUN='data/catalog-runs/apparelx-fabrics-10000';
function arg(flag,fallback=null){const index=process.argv.indexOf(flag);return index<0?fallback:process.argv[index+1];}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function percentile(values,fraction){if(!values.length)return 0;const ordered=[...values].sort((a,b)=>a-b);return ordered[Math.min(ordered.length-1,Math.floor((ordered.length-1)*fraction))];}
function candidates(runDir,maxImages,target){
  const productsDir=path.join(runDir,'products'),eligible=[];
  for(const entry of fs.readdirSync(productsDir,{withFileTypes:true}).filter(item=>item.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}))){
    const dir=path.join(productsDir,entry.name),productFile=path.join(dir,'product.json'),mediaFile=path.join(dir,'media-manifest.json');
    if(!fs.existsSync(productFile)||!fs.existsSync(mediaFile))continue;
    const product=readJson(productFile),media=readJson(mediaFile);if(contract.invalidReason(product,media))continue;
    const seen=new Set(),images=[];for(const image of media.images||[]){const key=String(image.sha256||image.localPath||'');if(!key||seen.has(key))continue;seen.add(key);images.push(image);if(images.length===maxImages)break;}
    eligible.push({dir,images});if(eligible.length===target)break;
  }
  return eligible;
}
async function optimizedBytes(filename){
  const image=sharp(filename,{failOn:'error'}).rotate().toColourspace('srgb');
  const full=await image.clone().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:80,effort:6,smartSubsample:true}).toBuffer();
  const thumb=await image.clone().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).webp({quality:76,effort:6,smartSubsample:true}).toBuffer();
  return full.length+thumb.length;
}
async function estimate({runDir=DEFAULT_RUN,sampleSize=100,maxImages=4,target=4736}={}){
  const safeMaxImages=Number(maxImages);if(!Number.isInteger(safeMaxImages)||safeMaxImages<1||safeMaxImages>4)throw new Error('--max-images must be an integer from 1 to 4');
  const safeTarget=Number(target);if(!Number.isInteger(safeTarget)||safeTarget<1)throw new Error('--target must be a positive integer');
  const absoluteRun=path.resolve(runDir),products=candidates(absoluteRun,safeMaxImages,safeTarget),safeSample=Math.max(1,Math.min(products.length,Number(sampleSize)||100));
  if(!products.length)throw new Error('No eligible products found');
  const sampleIndexes=[...new Set(Array.from({length:safeSample},(_,index)=>Math.floor(index*(products.length-1)/Math.max(1,safeSample-1))))],productBytes=[];
  for(const index of sampleIndexes){let bytes=0;for(const media of products[index].images){bytes+=await optimizedBytes(path.resolve(absoluteRun,media.localPath));}productBytes.push(bytes);}
  const average=productBytes.reduce((sum,value)=>sum+value,0)/productBytes.length,totalImages=products.reduce((sum,item)=>sum+item.images.length,0);
  return {version:1,eligible_products:products.length,sampled_products:productBytes.length,max_images_per_product:safeMaxImages,selected_images:totalImages,projected_objects:totalImages*2,quality:{full:{max_dimension:1600,webp_quality:80},thumbnail:{max_dimension:640,webp_quality:76}},sample_product_bytes:{average:Math.round(average),p50:percentile(productBytes,.5),p95:percentile(productBytes,.95),max:Math.max(...productBytes)},projected_storage_bytes:Math.round(average*products.length),projected_storage_mb:Number((average*products.length/1024/1024).toFixed(2))};
}
async function main(){const report=await estimate({runDir:arg('--run-dir',DEFAULT_RUN),sampleSize:arg('--sample-size',100),maxImages:arg('--max-images',4),target:arg('--target',4736)});process.stdout.write(`${JSON.stringify(report,null,2)}\n`);}
if(require.main===module)main().catch(error=>{process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;});
module.exports={estimate,percentile};
