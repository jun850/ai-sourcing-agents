'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {LocalFabricPreview,previewProduct}=require('./local-preview');

test('local preview uses neutral priced identifiers and media routes',()=>{
  const product={entityType:'product',sourceId:'1000277',sku:'100',name:'High Density Jersey',makerName:'Example Mill',material:'100% cotton',subcategory:'Jersey / Pique',specification:'industry weight: 227.7 gsm',faqs:[]};
  const media={images:[{localPath:'products/private/images/one.jpg',width:595,height:841,bytes:123,sha256:'a'.repeat(64)}]};
  const value=previewProduct(product,media);
  assert.match(value.sku,/^FAB-[A-HJ-NP-Z2-9]{10}$/);
  assert.equal(JSON.stringify(value).includes('1000277'),false);
  assert.ok(value.price>0);
  assert.equal(value.pricing_mode,'fixed');
  assert.ok(value.catalog_prices.JPY>=900);
  assert.equal(value.supplier_verified,false);
  assert.equal(value.media[0].public_url,`/__local_catalog/media/${value.sku}/0`);
});

test('local preview publishes only a derived Atelix price',()=>{
  const product={entityType:'product',sourceId:'1000891',name:'Broadcloth',makerName:'Example Mill',material:'Cotton',sourcePrice:{amount:'2.0200',currency:'USD'},faqs:[]};
  const media={images:[{localPath:'private/one.jpg',width:100,height:100,bytes:12,sha256:'a'.repeat(64)}]};
  const value=previewProduct(product,media);
  assert.equal(value.pricing_mode,'fixed');assert.equal(value.price,2.5);assert.equal(JSON.stringify(value).includes('sourcePrice'),false);
});

test('local preview filters and facets cover the full matching catalogue',()=>{
  const preview=new LocalFabricPreview('/tmp/not-used');
  preview.cache={
    products:[
      {id:'b',category:'fabrics',construction_slug:'plain-weave',comp:'100% Cotton',pricing_mode:'quote',price:0,badge:'',supplier_name:'One',supplier_region:'Japan',supplier_city:'Tokyo'},
      {id:'a',category:'fabrics',construction_slug:'plain-weave',comp:'Polyester',pricing_mode:'fixed',price:4,badge:'oem',supplier_name:'Two',supplier_region:'China',supplier_city:'Suzhou'}
    ],skipped:[]
  };
  const value=preview.list({materials:['Cotton'],pageSize:1});
  assert.equal(value.total,1);
  assert.equal(value.products[0].id,'b');
  assert.deepEqual(value.facets.countries,{Japan:1,China:1});
  assert.deepEqual(value.facets.regions.Japan,{Tokyo:1});
  assert.equal(value.facets.materials.Cotton,1);
  assert.equal(value.facets.materials.Polyester,1);
  assert.equal(preview.list({maxPrice:5}).total,1);
  assert.equal(preview.list({sort:'price'}).products[0].id,'a');
  preview.cache.products[0].supplier_slug='one';preview.cache.products[1].supplier_slug='two';assert.equal(preview.list({supplierSlug:'one'}).total,1);
});
