'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validate,verifyAlgoliaObject}=require('./publish-fabric-batch');

function stable(value){if(Array.isArray(value))return value.map(stable);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));}
function sha(value){return crypto.createHash('sha256').update(Buffer.isBuffer(value)?value:JSON.stringify(stable(value))).digest('hex');}
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atelix-fabric-batch-')),productId='00000000-0000-4000-8000-000000000001',full=Buffer.from('full-webp-fixture'),thumb=Buffer.from('thumb-webp-fixture'),fullHash=sha(full),thumbHash=sha(thumb);
  const storagePath=`products/${productId}/${fullHash}-1600.webp`,thumbPath=`products/${productId}/${thumbHash}-640.webp`;
  for(const [name,bytes] of [[storagePath,full],[thumbPath,thumb]]){const file=path.join(root,'media',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
  const media={role:'sample_card',position:0,public_url:`https://example.supabase.co/storage/v1/object/public/catalog-media/${storagePath}`,thumb_url:`https://example.supabase.co/storage/v1/object/public/catalog-media/${thumbPath}`,storage_path:storagePath,thumb_storage_path:thumbPath,width:100,height:100,bytes:full.length,sha256:fullHash,thumb_bytes:thumb.length,thumb_sha256:thumbHash,alt_i18n:{en:'Fabric sample',ja:'生地サンプル',zh:'面料样品'}};
  const prices=[{currency:'USD',base_amount:2.083333,fx_rate:1,fx_snapshot_id:'test',markup_bps:2000,rounding_increment:.1,catalog_amount:2.5,calculation_version:'test'},{currency:'JPY',base_amount:333.333333,fx_rate:1,fx_snapshot_id:'test',markup_bps:2000,rounding_increment:100,catalog_amount:400,calculation_version:'test'}];
  const entities=[{id:productId,factory_id:'00000000-0000-4000-8000-000000000002',product:{sku:'FAB-ABCDEFG234',pricing_mode:'fixed',price:2.5},prices,media:[media],faqs:[]}];
  const base={version:1,release_id:'00000000-0000-4000-8000-000000000004',kind:'product',sequence_no:1,deployed_git_sha:'a'.repeat(40),storage_bytes:full.length+thumb.length,entities};
  const document={...base,manifest_sha256:sha(base),batch_id:'00000000-0000-4000-8000-000000000003'},manifestFile=path.join(root,'product-batch-001.json');fs.writeFileSync(manifestFile,JSON.stringify(document));
  return {root,document,manifestFile};
}

test('batch validation verifies both immutable media variants and exact storage bytes',()=>{const value=fixture();try{assert.equal(validate(value.document,value.manifestFile),value.document);}finally{fs.rmSync(value.root,{recursive:true,force:true});}});
test('batch validation rejects an unverified thumbnail byte count',()=>{const value=fixture();try{value.document.entities[0].media[0].thumb_bytes+=1;const base={version:value.document.version,release_id:value.document.release_id,kind:value.document.kind,sequence_no:value.document.sequence_no,deployed_git_sha:value.document.deployed_git_sha,storage_bytes:value.document.storage_bytes,entities:value.document.entities};value.document.manifest_sha256=sha(base);assert.throws(()=>validate(value.document,value.manifestFile),/thumbnail hash or byte count mismatch/);}finally{fs.rmSync(value.root,{recursive:true,force:true});}});
test('Algolia read-back tolerates bounded indexing delay',async()=>{let calls=0,waits=0;await verifyAlgoliaObject({url:'https://example.test/object',headers:{},objectId:'FAB-TEST',attempts:4,fetchImpl:async()=>({ok:++calls===3,status:calls===3?200:404}),wait:async()=>{waits+=1;}});assert.equal(calls,3);assert.equal(waits,2);});
test('Algolia read-back still fails after the retry bound',async()=>{await assert.rejects(verifyAlgoliaObject({url:'https://example.test/object',headers:{},objectId:'FAB-MISSING',attempts:3,fetchImpl:async()=>({ok:false,status:404}),wait:async()=>{}}),/after 3 attempts \(status 404\)/);});
