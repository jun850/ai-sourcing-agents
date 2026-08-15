#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');

function arg(flag,fallback=null){const index=process.argv.indexOf(flag);return index<0?fallback:process.argv[index+1];}
function publicConfig(){
  const source=fs.readFileSync(path.resolve(__dirname,'../../../js/supabase-entry.js'),'utf8');
  return {url:source.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1],key:source.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/)?.[1]};
}
async function main(){
  const fallback=publicConfig(),url=String(process.env.SUPABASE_URL||fallback.url||'').replace(/\/$/,''),serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,key=serviceKey||process.env.SUPABASE_PUBLISHABLE_KEY||fallback.key,output=path.resolve(arg('--output','data/catalog-runs/apparelx-fabrics-10000/production-factories.json'));
  if(!/^https:\/\/[a-z0-9-]+[.]supabase[.]co$/.test(url)||!key)throw new Error('Supabase URL and API key are required');
  if(process.argv.includes('--require-privileged')&&!serviceKey)throw new Error('--require-privileged needs SUPABASE_SERVICE_ROLE_KEY');
  const select='id,slug,name,type,region,loc,verify_state,copy_i18n,logo_img,page_img,archived_at',factories=[];
  for(let offset=0;;offset+=1000){
    const response=await fetch(`${url}/rest/v1/factories?select=${encodeURIComponent(select)}&order=name.asc`,{headers:{apikey:key,authorization:`Bearer ${key}`,range:`${offset}-${offset+999}`}});
    if(!response.ok)throw new Error(`Factory snapshot failed ${response.status}: ${(await response.text()).slice(0,500)}`);
    const rows=await response.json();factories.push(...rows);if(rows.length<1000)break;
  }
  const document={version:1,generated_at:new Date().toISOString(),supabase_url:url,privileged:Boolean(serviceKey),factories};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,`${JSON.stringify(document,null,2)}\n`);
  process.stdout.write(`${JSON.stringify({output:path.relative(process.cwd(),output),privileged:document.privileged,factories:factories.length},null,2)}\n`);
}

if(require.main===module)main().catch(error=>{process.stderr.write(`${error.stack||error.message}\n`);process.exitCode=1;});
