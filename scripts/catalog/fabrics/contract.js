'use strict';

const crypto=require('node:crypto');
const taxonomy=require('../../../js/catalog-taxonomy.js');

const PUBLIC_FORBIDDEN=[
  /apparel[ -]?x/i,/www[.]apparel-x[.]com/i,/item[.]php[?]itemid=/i,
  /source(?:_| )?(?:id|url|key|price|cost|contact|provenance)/i,
  /supplierSourceId|supplierCode|makerId|external[_ ]?id/i,
  /"(?:phone|fax|email|contact_email|contact_phone|source_contact)"\s*:/i
];
const FAQ_REJECT=[
  /apparel[ -]?x|support page|cash on delivery|refund|payment method|cutting fee|yen|direct shipment/i,
  /stock|delivery date|not in stock|quantity may change|middle cut|one roll|sample card.*not listed/i,
  /trademark|hangtag|woven label|pertex|sojitz/i
];
const FAQ_RELEVANT=/wash|clean|care|shrink|color|colour|lot|print|dye|stain|glue|curl|finish|width|weight|composition|use|application|sample|test data/i;

function normalizeMaker(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
function makerSlug(value){return normalizeMaker(value).replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64);}
function uuidFromText(value){
  const bytes=crypto.createHash('sha256').update(String(value)).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function skuFromKey(value){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes=crypto.createHash('sha256').update(`atelix-fabric:${value}`).digest();
  let code='';for(let index=0;index<10;index+=1)code+=alphabet[bytes[index]%alphabet.length];
  return `FAB-${code}`;
}
function localeComplete(copy,fields=['name','description']){
  return taxonomy.LOCALES.every(locale=>copy?.[locale]&&fields.every(field=>String(copy[locale][field]||'').trim()));
}
function localeCopy(value){
  const source=value?.copy_i18n||value||{};
  return Object.fromEntries(taxonomy.LOCALES.map(locale=>[locale,{
    name:String(source?.[locale]?.name||'').trim(),
    description:String(source?.[locale]?.description||'').trim()
  }]));
}
function isDiscontinued(product){return product?.lifecycle?.excludeAfterCrawl===true||['discontinued','scheduled_for_discontinuation'].includes(product?.lifecycle?.status);}
function invalidReason(product,media){
  if(!product||product.entityType!=='product')return 'invalid_record';
  if(isDiscontinued(product))return 'discontinued';
  if(!String(product.name||'').trim())return 'missing_name';
  if(!String(product.makerName||'').trim()||/^(?:no name|unknown|n[\/]?a|-+)$/i.test(product.makerName))return 'missing_maker';
  if(!Array.isArray(media?.images)||!media.images.length)return 'missing_images';
  return null;
}
function selectRelevantFaqs(product){
  const maker=normalizeMaker(product?.makerName);
  return (product?.faqs||[]).filter(faq=>{
    const text=`${faq.question||''} ${faq.answer||''}`;
    if(!faq.question||!faq.answer||FAQ_REJECT.some(pattern=>pattern.test(text))||!FAQ_RELEVANT.test(text))return false;
    const named=text.match(/\b([A-Z][A-Za-z0-9& -]{2,40})'s (?:textile|fabric|series)\b/);
    return !named||normalizeMaker(named[1])===maker;
  }).slice(0,4).map((faq,index)=>({local_faq_key:`faq-${index+1}`,question:String(faq.question).trim(),answer:String(faq.answer).trim()}));
}
function assertSourceFree(value,label='public payload'){
  const serialized=JSON.stringify(value);
  const violation=PUBLIC_FORBIDDEN.find(pattern=>pattern.test(serialized));
  if(violation)throw new Error(`${label} contains forbidden source/provenance content (${violation})`);
  return value;
}
function publicSupplier(product,metadata={}){
  const normalized=normalizeMaker(product.makerName),slug=makerSlug(product.makerName);
  if(!slug)throw new Error('supplier slug is empty');
  const copy=localeCopy(metadata),region=String(metadata.region||'').trim()||null,loc=String(metadata.loc||'').trim()||null;
  if(!localeComplete(copy))throw new Error(`supplier translations incomplete: ${normalized}`);
  return assertSourceFree({
    id:uuidFromText(`atelix-fabric-mill:${normalized}`),slug,name:String(copy.en?.name||product.makerName).trim(),type:'fabric_mill',
    region,loc,verify_state:'verified',copy_i18n:copy,initials:String(copy.en?.name||product.makerName).split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase(),
    owner_profile_id:null
  },'supplier payload');
}
function localizedAlt(copy,role='sample_card'){
  const names=localeCopy(copy),suffix={
    en:role==='flat_swatch'?'fabric swatch':'fabric sample',
    ja:role==='flat_swatch'?'生地スワッチ':'生地サンプル',
    zh:role==='flat_swatch'?'面料色样':'面料样品'
  };
  return Object.fromEntries(taxonomy.LOCALES.map(locale=>[locale,`${names[locale].name} ${suffix[locale]}`.trim()]));
}
function parseMetric(text,label){const match=String(text||'').match(new RegExp(`${label}[^0-9]{0,12}([0-9]+(?:[.]?[0-9]+)?)`,'i'));return match?Number(match[1]):null;}
function catalogPrice(sourcePrice,markupBps=2000){
  const amount=Number(sourcePrice?.amount),currency=String(sourcePrice?.currency||'').toUpperCase();
  if(!Number.isFinite(amount)||amount<=0||currency!=='USD'||!Number.isInteger(markupBps)||markupBps<2000)return null;
  return Number((Math.ceil((amount*(1+markupBps/10000))/0.1)*0.1).toFixed(2));
}
function publicProduct(product,copy,media,pricing=null){
  const sku=skuFromKey(product.sourceId),constructionSlug=taxonomy.classify(product);
  const price=pricing?.usd??catalogPrice(product.sourcePrice);
  const fields={
    sku,name:copy.en.name,description:copy.en.description,copy_i18n:copy,category:'fabrics',construction_slug:constructionSlug,
    construction:taxonomy.label(constructionSlug,'en'),subcategory:String(product.subcategory||'').trim()||null,
    comp:String(product.material||'').trim()||null,spec:String(product.specification||'').trim()||null,gsm:parseMetric(product.specification,'weight'),
    applications:String(product.useApplications||'').trim()||null,season:String(product.season||'').trim()||null,handling_notes:String(product.handling||'').trim()||null,
    pricing_mode:price==null?'quote':'fixed',price:price??0,unit_type:'m',moq:null,listing_status:'active',is_private:false,
    images:media.map(item=>item.public_url),img:media[0]?.thumb_url||media[0]?.public_url||null
  };
  return assertSourceFree(fields,'product payload');
}

module.exports={FAQ_REJECT,PUBLIC_FORBIDDEN,assertSourceFree,catalogPrice,invalidReason,isDiscontinued,localeComplete,localeCopy,localizedAlt,makerSlug,normalizeMaker,publicProduct,publicSupplier,selectRelevantFaqs,skuFromKey,uuidFromText};
