#!/usr/bin/env node
"use strict";
const fs=require("fs"), path=require("path");
const root=path.resolve(__dirname,"..");
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if([".git",".claude",".vercel","node_modules"].includes(entry.name))continue;const file=path.join(dir,entry.name);entry.isDirectory()?walk(file):files.push(file);}}
walk(root);
const problems=[];
for(const file of files){
  const relative=path.relative(root,file);
  if(!/\.(html|js|css|json|sql)$/.test(file))continue;
  const text=fs.readFileSync(file,"utf8");
  if(!relative.startsWith("scripts/")&&/\bMVP\b/i.test(text))problems.push(`${relative}: contains retired MVP terminology`);
  if(/\.html$/.test(file)){
    for(const match of text.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)){
      try{new Function(match[1]);}catch(error){problems.push(`${relative}: invalid inline JavaScript (${error.message})`);}
    }
  }
}
for(const file of ["vercel.json","package.json"])try{JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));}catch(error){problems.push(`${file}: ${error.message}`)}
const quotePage=fs.readFileSync(path.join(root,"pages/product.html"),"utf8");
const pageStyles=fs.readFileSync(path.join(root,"css/pages.css"),"utf8");
const globalStyles=fs.readFileSync(path.join(root,"css/styles.css"),"utf8");
const translations=fs.readFileSync(path.join(root,"js/data.js"),"utf8");
const catalogApi=fs.readFileSync(path.join(root,"js/api.js"),"utf8");
const categoryPage=fs.readFileSync(path.join(root,"pages/category.html"),"utf8");
const catalogMigration=fs.readFileSync(path.join(root,"supabase/migrations/20260814123000_catalog_import_pipeline.sql"),"utf8");
const productOptions=fs.readFileSync(path.join(root,"js/product-options.js"),"utf8");
const optionMigration=fs.readFileSync(path.join(root,"supabase/migrations/20260814110000_product_options_and_fabric_catalog.sql"),"utf8");
const algoliaSync=fs.readFileSync(path.join(root,"supabase/functions/algolia-sync/index.ts"),"utf8");
const vercelIgnore=fs.readFileSync(path.join(root,".vercelignore"),"utf8");
for(const privatePath of ['.env*','data/','research/','scripts/','supabase/'])if(!vercelIgnore.split(/\r?\n/).includes(privatePath))problems.push(`.vercelignore: missing private deployment boundary ${privatePath}`);
if(!/verifiedGatewayRole\(authorization\) === "service_role"/.test(algoliaSync))problems.push('algolia-sync: service-role publisher must pass the verified gateway boundary');
if(!/function compact\(value: unknown, max = 1200\)/.test(algoliaSync))problems.push('algolia-sync: supplier search records must stay below provider size limits');
if(!/return `mailto:info@arcanawangsa\.com\?subject=/.test(quotePage))problems.push("pages/product.html: quote contact must use a real mailto link to info@arcanawangsa.com");
if(!/<a class="btn btn-gold" id="emailBtn" href="\$\{contactHref\([^}]+\}\">\$\{IC\.msg\} \$\{T\('Contact supplier'\)\}<\/a>/.test(quotePage))problems.push("pages/product.html: quote-only products must render the localized Contact supplier email anchor");
if(!/\.pdp-cta--quote\{position:static;/.test(pageStyles))problems.push("css/pages.css: mobile quote contact action must remain in the product page flow");
if(!/aria-pressed="\$\{Store\.isSaved\(p\.id\)\}"/.test(quotePage))problems.push("pages/product.html: wishlist toggle must expose its pressed state");
if(!/<input type="number" id="pdpQuantity"/.test(quotePage))problems.push("pages/product.html: product quantity must use numeric input semantics");
if(!/class="pkg-radio" type="radio"/.test(quotePage)||!/role="radiogroup"/.test(quotePage))problems.push("pages/product.html: OEM package choices must use accessible radio semantics");
if(!/catch\(_\)\{toast\(T\('Could not copy product link'\)\);\}/.test(quotePage))problems.push("pages/product.html: product sharing must announce clipboard failures");
if([...quotePage.matchAll(/<script[^>]+src=/g)].some(match=>!/<script\s+defer\s+src=/.test(match[0])))problems.push("pages/product.html: external scripts must not block HTML parsing");
for(const contract of ["ATELIX_normalizeProductOptions","ATELIX_productOptionEditor","ATELIX_readProductOptions"])if(!productOptions.includes(contract))problems.push(`js/product-options.js: missing ${contract} contract`);
if(!/data-product-option/.test(quotePage)||!/data-gallery-image/.test(quotePage)||!/Store\.addToCart\([^;]+selectedOptions/.test(quotePage))problems.push("pages/product.html: product options and gallery must remain wired into ordering");
for(const file of ["pages/admin-supplier.html","pages/dashboard.html","intools/dashboard.html"]){const source=fs.readFileSync(path.join(root,file),"utf8");if(!source.includes("product-options.js"))problems.push(`${file}: shared product option editor is not loaded`);}
for(const contract of ["option_name","option_value","supplier_set_product_options","option_selection","intools_save_product_legacy","FAB-171"])if(!optionMigration.includes(contract))problems.push(`product option migration missing: ${contract}`);
const importedSkus=['FAB-140','FAB-144','FAB-147',...Array.from({length:14},(_,index)=>`FAB-${158+index}`)];
for(const sku of importedSkus)if(!translations.includes(`id:'${sku}'`))problems.push(`js/data.js: missing workbook product ${sku}`);
const importedAssets=files.filter(file=>file.startsWith(path.join(root,'assets/catalog/fabrics'))&&/\.jpg$/i.test(file));
if(importedAssets.length!==49)problems.push(`assets/catalog/fabrics: expected 49 JPGs, found ${importedAssets.length}`);
for(const key of ['Contact supplier','Could not copy product link','Decrease quantity','Increase quantity'])if((translations.match(new RegExp(`'${key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`,'g'))||[]).length<3)problems.push(`js/data.js: ${key} must be available in all supported languages`);
for(const relative of ['index.html','pages/product.html','pages/supplier.html','pages/category.html','pages/factories.html','js/components.js']){
  const source=fs.readFileSync(path.join(root,relative),'utf8');
  for(const mailto of source.matchAll(/mailto:([^?"'`$\s]+)/gi))if(mailto[1].toLowerCase()!=='info@arcanawangsa.com')problems.push(`${relative}: public mailto must use info@arcanawangsa.com`);
}
if(!translations.includes("window.ATELIX_CONTACT_EMAIL = 'info@arcanawangsa.com'"))problems.push('js/data.js: missing canonical Atelix contact address');
if(!catalogApi.includes('supplier_taxonomy_memberships(l2,l3,is_primary)'))problems.push('js/api.js: verified supplier taxonomy must hydrate with the public catalog');
if(!categoryPage.includes('supplierList.map(supplierCard)'))problems.push('pages/category.html: existing category grid must surface matching verified suppliers');
if(categoryPage.includes('class="ftags"'))problems.push('pages/category.html: supplier cards must not render capability tags');
if(fs.readFileSync(path.join(root,'pages/factories.html'),'utf8').includes('class="ftags"'))problems.push('pages/factories.html: supplier cards must not render capability tags');
if(!/\.sup-company-image img\{[^}]*object-fit:contain/.test(pageStyles))problems.push('css/pages.css: supplier hero images must preserve the full crop');
if(!/return \[country, city\]/.test(fs.readFileSync(path.join(root,'js/components.js'),'utf8')))problems.push('js/components.js: supplier locations must render country before city');
const supplierPage=fs.readFileSync(path.join(root,'pages/supplier.html'),'utf8');
if(supplierPage.includes('class="sup-tags"')||supplierPage.includes('class="panel capabilities"'))problems.push('pages/supplier.html: crawled supplier tags and capability metadata must remain backend-only');
if(supplierPage.includes('class="crumbs"'))problems.push('pages/supplier.html: supplier profiles must not render the broken factory breadcrumb');
if(supplierPage.includes('class="panel overview"'))problems.push('pages/supplier.html: supplier profiles must not render a company overview section');
if(!supplierPage.includes("const feat=PRODUCTS.filter(belongsToSupplier).slice(0,5)")||supplierPage.includes('own.length?own')||!supplierPage.includes("/^F-\\d+$/.test(String(f.id))"))problems.push('pages/supplier.html: public products must use exact supplier linkage without imported-name or category fallback');
if(!supplierPage.includes('supplier-products-empty'))problems.push('pages/supplier.html: suppliers without exact linked products must render an empty state');
if(fs.readFileSync(path.join(root,'pages/search.html'),'utf8').includes('(factory.tags||[])'))problems.push('pages/search.html: supplier tags must not render or drive public browser search');
for(const contract of ['copy_i18n','supplier_taxonomy_memberships','supplier_source_contacts','catalog_media_records','catalog_calculate_price'])if(!catalogMigration.includes(contract))problems.push(`catalog import migration missing: ${contract}`);
const gold=(globalStyles.match(/--gold:(#[0-9a-f]{6})/i)||[])[1];
const luminance=hex=>{const channels=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return .2126*channels[0]+.7152*channels[1]+.0722*channels[2]};
if(!gold||1.05/(luminance(gold)+.05)<7)problems.push("css/styles.css: brass CTA must maintain 7:1 contrast with white text");
if(problems.length){console.error(problems.join("\n"));process.exit(1)}
console.log(`Static QA passed across ${files.length} files.`);
