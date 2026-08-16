'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {digest,removeBatchManifests,transformedThumbUrl}=require('./prepare-fabric-batches');

test('prepared media hashes use raw bytes',()=>{
  const bytes=Buffer.from([0,1,2,3,255]);
  const expected=crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest(bytes),expected);
});

test('smaller releases remove stale product batch manifests',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'atelix-fabric-batches-'));
  try{
    fs.writeFileSync(path.join(directory,'product-batch-001.json'),'{}');
    fs.writeFileSync(path.join(directory,'product-batch-040.json'),'{}');
    fs.writeFileSync(path.join(directory,'supplier-batch-001.json'),'{}');
    fs.writeFileSync(path.join(directory,'release-plan.json'),'{}');
    assert.equal(removeBatchManifests(directory,'product'),2);
    assert.deepEqual(fs.readdirSync(directory).sort(),['release-plan.json','supplier-batch-001.json']);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('transformed thumbnails use the Supabase render endpoint',()=>{
  assert.equal(
    transformedThumbUrl('https://example.supabase.co/storage/v1/object/public/catalog-media','products/abc/image-1600.webp'),
    'https://example.supabase.co/storage/v1/render/image/public/catalog-media/products/abc/image-1600.webp?width=640&quality=76&resize=contain'
  );
});
