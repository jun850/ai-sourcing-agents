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
if(!/return `mailto:info@arcanawangsa\.com\?subject=/.test(quotePage))problems.push("pages/product.html: quote contact must use a real mailto link to info@arcanawangsa.com");
if(!/<a class="btn btn-gold" id="emailBtn" href="\$\{contactHref\([^}]+\}\">\$\{IC\.msg\} Contact Atelix for quote<\/a>/.test(quotePage))problems.push("pages/product.html: quote-only products must render the Contact Atelix email anchor");
if(!/\.pdp-cta--quote\{position:static;/.test(pageStyles))problems.push("css/pages.css: mobile quote contact action must remain in the product page flow");
if(problems.length){console.error(problems.join("\n"));process.exit(1)}
console.log(`Static QA passed across ${files.length} files.`);
