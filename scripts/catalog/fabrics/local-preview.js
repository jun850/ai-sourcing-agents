'use strict';

const fs=require('node:fs');
const path=require('node:path');
const contract=require('./contract');
const pricing=require('./pricing');
const taxonomy=require('../../../js/catalog-taxonomy.js');

const DEFAULT_RUN_DIR=path.resolve(__dirname,'../../../data/catalog-runs/apparelx-fabrics-10000');
const PREVIEW_PREFIX='/__local_catalog';
const MATERIAL_FACETS=['Cotton','Polyester','Linen','Nylon','Wool','Viscose','Spandex'];

function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function firstMetric(text,pattern){const match=String(text||'').match(pattern);return match?Number(match[1]):null;}
function publicName(product){
  const name=String(product.name||'').trim();
  return name||`${taxonomy.label(taxonomy.classify(product),'en')} fabric`;
}
function countBy(items,key){
  return items.reduce((counts,item)=>{const value=key(item);if(value)counts[value]=(counts[value]||0)+1;return counts;},{});
}
function previewProduct(product,mediaManifest){
  const sku=contract.skuFromKey(product.sourceId),constructionSlug=taxonomy.classify(product);
  const makerKey=contract.normalizeMaker(product.makerName),factoryId=contract.uuidFromText(`atelix-fabric-mill:${makerKey}`),supplierSlug=contract.makerSlug(product.makerName);
  const images=(mediaManifest.images||[]).slice(0,4).map((image,position)=>({
    role:position===0?'sample_card':position===1?'texture':position===2?'drape':'detail',
    position,
    public_url:`${PREVIEW_PREFIX}/media/${encodeURIComponent(sku)}/${position}`,
    thumb_url:`${PREVIEW_PREFIX}/media/${encodeURIComponent(sku)}/${position}`,
    width:image.width||null,height:image.height||null,bytes:image.bytes||null,
    sha256:image.sha256||null,alt_i18n:{en:`${publicName(product)} fabric sample`}
  }));
  const name=publicName(product),description=[name,String(product.material||'').trim(),taxonomy.label(constructionSlug,'en')].filter(Boolean).join('. '),publicPrice=pricing.publicPricing(product);
  const faqs=contract.selectRelevantFaqs(product).map(item=>({question:item.question,answer:item.answer}));
  const value={
    id:contract.uuidFromText(`atelix-product:${product.sourceId}`),sku,name,description,
    copy_i18n:{en:{name,description}},category:'fabrics',construction_slug:constructionSlug,
    construction:taxonomy.label(constructionSlug,'en'),subcategory:String(product.subcategory||'').trim()||null,
    comp:String(product.material||'').trim()||null,spec:String(product.specification||'').trim()||null,
    gsm:firstMetric(product.specification,/(?:industry )?weight[^0-9]{0,12}([0-9]+(?:[.]?[0-9]+)?)/i),
    applications:String(product.useApplications||'').trim()||null,season:String(product.season||'').trim()||null,
    handling_notes:String(product.handling||'').trim()||null,pricing_mode:'fixed',price:publicPrice.usd,catalog_prices:{USD:publicPrice.usd,JPY:publicPrice.jpy},unit_type:'m',moq:null,
    listing_status:'active',is_private:false,media:images,images:images.map(item=>item.public_url),img:images[0]?.thumb_url||null,
    faqs,factory_id:factoryId,supplier_slug:supplierSlug,supplier_name:String(product.makerName||'').trim(),supplier_verified:false
  };
  return contract.assertSourceFree(value,'local preview product');
}

class LocalFabricPreview{
  constructor(runDir=DEFAULT_RUN_DIR){this.runDir=path.resolve(runDir);this.cache=null;}
  load(){
    if(this.cache)return this.cache;
    const productsDir=path.join(this.runDir,'products');
    const readiness=readJson(path.join(this.runDir,'prepared-source-free/readiness-report.json'));
    const excluded=new Set((readiness.excluded||[]).map(item=>item.local_key));
    const products=[],mediaByKey=new Map(),skipped=[];
    for(const entry of fs.readdirSync(productsDir,{withFileTypes:true}).filter(item=>item.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}))){
      if(excluded.has(entry.name))continue;
      const directory=path.join(productsDir,entry.name),productPath=path.join(directory,'product.json'),mediaPath=path.join(directory,'media-manifest.json');
      if(!fs.existsSync(productPath)||!fs.existsSync(mediaPath))continue;
      try{
        const product=readJson(productPath),media=readJson(mediaPath);
        if(contract.invalidReason(product,media))continue;
        const preview=previewProduct(product,media);
        products.push(preview);
        (media.images||[]).slice(0,4).forEach((image,position)=>mediaByKey.set(`${preview.sku}:${position}`,path.resolve(this.runDir,image.localPath)));
      }catch(error){skipped.push({local_key:entry.name,error:error.message});}
    }
    const factories=[...new Map(products.map(item=>[item.supplier_slug,{id:item.factory_id,slug:item.supplier_slug,name:item.supplier_name,type:'fabric_mill',region:null,loc:null,verify_state:'pending',copy_i18n:{en:{name:item.supplier_name,description:''}},product_count:products.filter(product=>product.factory_id===item.factory_id).length,supplier_taxonomy_memberships:[{l2:'fabrics',l3:null,is_primary:true}]}])).values()];
    const supplierTotal=factories.length;
    this.cache={products,bySku:new Map(products.map(item=>[item.sku,item])),factories,byFactorySlug:new Map(factories.map(item=>[item.slug,item])),mediaByKey,supplierTotal,skipped};
    return this.cache;
  }
  list({category='fabrics',construction=null,supplierSlug=null,page=1,pageSize=24,materials=[],country=null,regions=[],availability='all',minPrice=null,maxPrice=null,sort='recommended'}={}){
    const cache=this.load(),safePage=Math.max(1,Number(page)||1),safePageSize=Math.min(50,Math.max(1,Number(pageSize)||24));
    const base=cache.products.filter(item=>(!category||item.category===category)&&(!construction||item.construction_slug===construction)&&(!supplierSlug||item.supplier_slug===supplierSlug));
    const materialValues=(Array.isArray(materials)?materials:[]).map(String).filter(Boolean),regionValues=(Array.isArray(regions)?regions:[]).map(String).filter(Boolean);
    const safeAvailability=['all','oem','nonoem'].includes(availability)?availability:'all';
    const filtered=base.filter(item=>{
      if(materialValues.length&&!materialValues.some(material=>String(item.comp||'').toLowerCase().includes(material.toLowerCase())))return false;
      if(country&&item.supplier_region!==country)return false;
      if(regionValues.length&&!regionValues.includes(item.supplier_city))return false;
      if(safeAvailability==='oem'&&item.badge!=='oem')return false;
      if(safeAvailability==='nonoem'&&item.badge==='oem')return false;
      if((minPrice!=null||maxPrice!=null)&&item.pricing_mode!=='fixed')return false;
      if(minPrice!=null&&Number(item.price)<Number(minPrice))return false;
      if(maxPrice!=null&&Number(item.price)>Number(maxPrice))return false;
      return true;
    });
    const safeSort=['recommended','new','moq','price'].includes(sort)?sort:'recommended';
    filtered.sort((a,b)=>safeSort==='price'?Number(a.pricing_mode!=='fixed')-Number(b.pricing_mode!=='fixed')||Number(a.price)-Number(b.price):safeSort==='moq'?Number(a.moq||0)-Number(b.moq||0):String(b.id).localeCompare(String(a.id)));
    const countries=countBy(base,item=>item.supplier_region),regionFacets={};
    for(const item of base){if(!item.supplier_region||!item.supplier_city)continue;(regionFacets[item.supplier_region]||={})[item.supplier_city]=((regionFacets[item.supplier_region]||{})[item.supplier_city]||0)+1;}
    const materialFacets=Object.fromEntries(MATERIAL_FACETS.map(material=>[material,base.filter(item=>String(item.comp||'').toLowerCase().includes(material.toLowerCase())).length]));
    const offset=(safePage-1)*safePageSize;
    return {preview:true,total:filtered.length,page:safePage,page_size:safePageSize,supplier_total:new Set(filtered.map(item=>item.supplier_name).filter(Boolean)).size,facets:{materials:materialFacets,countries,regions:regionFacets},products:filtered.slice(offset,offset+safePageSize),skipped_count:cache.skipped.length};
  }
  product(sku){return this.load().bySku.get(String(sku||''))||null;}
  factories(){return this.load().factories;}
  factory(slug){return this.load().byFactorySlug.get(String(slug||''))||null;}
  media(sku,position){return this.load().mediaByKey.get(`${sku}:${Number(position)}`)||null;}
}

module.exports={DEFAULT_RUN_DIR,LocalFabricPreview,previewProduct};
