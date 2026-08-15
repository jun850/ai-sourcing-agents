'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {digest}=require('./prepare-fabric-batches');

test('prepared media hashes use raw bytes',()=>{
  const bytes=Buffer.from([0,1,2,3,255]);
  const expected=crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest(bytes),expected);
});
