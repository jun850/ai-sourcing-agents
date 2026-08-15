#!/usr/bin/env node
'use strict';

const {execFileSync,spawnSync}=require('node:child_process');
function arg(flag){const index=process.argv.indexOf(flag);return index<0?null:process.argv[index+1];}
function main(){
  const projectRef=arg('--project-ref'),separator=process.argv.indexOf('--'),command=process.argv[separator+1],args=process.argv.slice(separator+2);
  if(!/^[a-z0-9]{20}$/.test(projectRef||'')||separator<0||!command)throw new Error('Usage: with-production-service-key.js --project-ref REF -- COMMAND [ARGS...]');
  const raw=execFileSync('npx',['supabase','projects','api-keys','--project-ref',projectRef,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}),parsed=JSON.parse(raw),keys=Array.isArray(parsed)?parsed:(parsed.api_keys||parsed.keys||[]);
  const row=keys.find(item=>{const label=String(item.name||item.type||'').toLowerCase();return label.includes('service_role')||label.includes('secret');}),serviceKey=row&&(row.api_key||row.key||row.value);
  if(!serviceKey)throw new Error('Supabase CLI did not return a service credential');
  const result=spawnSync(command,args,{cwd:process.cwd(),env:{...process.env,SUPABASE_URL:`https://${projectRef}.supabase.co`,SUPABASE_SERVICE_ROLE_KEY:serviceKey},stdio:'inherit'});
  if(result.error)throw result.error;process.exitCode=result.status??1;
}
if(require.main===module)try{main();}catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1;}
