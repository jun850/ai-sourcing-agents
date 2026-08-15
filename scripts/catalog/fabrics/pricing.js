'use strict';

const DEFAULT_USD_JPY=150;
function roundUp(value,increment){return Math.ceil((Number(value)-Number.EPSILON)/increment)*increment;}
function text(product){return [product.name,product.material,product.specification,product.subcategory,product.organization,product.handling].filter(Boolean).join(' ').toLowerCase();}
function metric(product){const match=String(product.specification||'').match(/(?:industry )?weight[^0-9]{0,12}([0-9]+(?:[.]?[0-9]+)?)/i);return match?Number(match[1]):null;}
function heuristicJpy(product){
  const value=text(product),composition=String(product.material||'').toLowerCase();let amount=1800,band='other';
  if(/silk|cashmere/.test(composition)){amount=4800;band='silk_cashmere';}
  else if(/(?:^|\D)100\s*%?\s*wool|all wool/.test(composition)){amount=4500;band='pure_wool';}
  else if(/wool|merino/.test(composition)){amount=3400;band='wool_blend';}
  else if(/linen|hemp|ramie/.test(composition)){amount=2400;band='linen_bast';}
  else if(/organic cotton/.test(composition)){amount=1900;band='organic_cotton';}
  else if(/cotton/.test(composition)){amount=1500;band='cotton';}
  else if(/nylon|polyamide/.test(composition)){amount=1700;band='nylon';}
  else if(/viscose|rayon|modal|lyocell|tencel|cupro/.test(composition)){amount=1600;band='cellulosic';}
  else if(/polyester|acrylic/.test(composition)){amount=1200;band='synthetic';}
  if(/jacquard|dobby|lace|tulle|tweed|melton/.test(value))amount+=600;
  else if(/denim|canvas|duck|corduroy|satin|crepe|organza|chiffon/.test(value))amount+=300;
  else if(/fleece|terry|interlock|rib|jersey|tricot|mesh/.test(value))amount+=200;
  if(/artificial leather|synthetic leather|coated|laminated|waterproof|water repellent/.test(value))amount+=400;
  if(/organic|recycled|supima|high[- ]gauge|functional|stretch/.test(value))amount+=200;
  const gsm=metric(product);if(gsm>=350)amount+=500;else if(gsm>=250)amount+=300;else if(gsm>=180)amount+=100;else if(gsm&&gsm<100)amount-=100;
  return {jpy:Math.max(900,Math.min(6000,roundUp(amount,100))),band,gsm};
}
function publicPricing(product,{usdJpy=DEFAULT_USD_JPY,fxSnapshotId='atelix-static-jpy-150'}={}){
  if(!(Number(usdJpy)>0)||!String(fxSnapshotId).trim())throw new Error('valid USD/JPY snapshot is required');
  const verifiedUsd=require('./contract').catalogPrice(product.sourcePrice);
  if(verifiedUsd!=null){const jpy=roundUp(verifiedUsd*usdJpy,100);return {pricing_mode:'fixed',usd:verifiedUsd,jpy,cny:null,origin:'verified_input',band:'verified',fx_snapshot_id:fxSnapshotId,usd_jpy:usdJpy};}
  const estimated=heuristicJpy(product),usd=Number(roundUp(estimated.jpy/usdJpy,.1).toFixed(2));
  return {pricing_mode:'fixed',usd,jpy:estimated.jpy,cny:null,origin:'atelix_band',band:estimated.band,gsm:estimated.gsm,fx_snapshot_id:fxSnapshotId,usd_jpy:usdJpy};
}
function catalogPriceRows(value){
  return [['USD',value.usd,.1],['JPY',value.jpy,100]].map(([currency,amount,increment])=>({currency,base_amount:Number((amount/1.2).toFixed(6)),fx_rate:1,fx_snapshot_id:value.fx_snapshot_id,markup_bps:2000,rounding_increment:increment,catalog_amount:amount,calculation_version:value.origin==='verified_input'?'atelix-verified-public-v1':'atelix-fabric-band-v1'}));
}

module.exports={DEFAULT_USD_JPY,catalogPriceRows,heuristicJpy,publicPricing,roundUp};
