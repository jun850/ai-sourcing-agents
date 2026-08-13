(function(){
  'use strict';

  const root=document.querySelector('[data-intools-page-root]');
  const route=document.body.dataset.intoolsRoute;
  if(!root||!route)return;

  const allowedTags=new Set(['P','H2','H3','STRONG','EM','U','A','UL','OL','LI','BR']);
  const safeUrl=value=>{try{const url=new URL(value,location.origin);return url.origin===location.origin||url.protocol==='https:'||url.protocol==='mailto:';}catch(_){return false;}};
  function sanitize(html){
    const doc=new DOMParser().parseFromString(`<body>${html||''}</body>`,'text/html');
    const clean=node=>{[...node.childNodes].forEach(child=>{
      if(child.nodeType===Node.COMMENT_NODE){child.remove();return;}
      if(child.nodeType!==Node.ELEMENT_NODE){return;}
      if(!allowedTags.has(child.tagName)){
        const fragment=doc.createDocumentFragment();
        while(child.firstChild)fragment.appendChild(child.firstChild);
        child.replaceWith(fragment);clean(node);return;
      }
      const href=child.tagName==='A'?child.getAttribute('href'):null;
      [...child.attributes].forEach(attribute=>child.removeAttribute(attribute.name));
      if(child.tagName==='A'&&href&&safeUrl(href)){child.setAttribute('href',href);child.setAttribute('rel','noopener noreferrer');}
      clean(child);
    });};
    clean(doc.body);return doc.body.innerHTML;
  }
  const esc=value=>String(value==null?'':value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  function widgetMarkup(widget){
    const content=widget.content||{},settings=widget.settings||{};
    const href=content.cta_url&&safeUrl(content.cta_url)?content.cta_url:null;
    const image=settings.image_url&&safeUrl(settings.image_url)?`<img src="${esc(settings.image_url)}" alt="${esc(settings.alt_text||'')}">`:'';
    return `<aside class="managed-widget managed-widget--${esc(settings.style_preset||'neutral')}" data-managed-widget="${esc(widget.key)}">${image}<div><strong>${esc(content.discount_label||content.headline||'')}</strong>${content.body?`<p>${esc(content.body)}</p>`:''}</div>${href?`<a class="btn btn-green" href="${esc(href)}">${esc(content.cta_label||'View offer')}</a>`:''}</aside>`;
  }
  async function hydrate(){
    const api=window.ARCANA_API;
    if(!api?.getPublishedContentPage)return;
    const locale=['en','ja','zh'].includes(document.documentElement.lang)?document.documentElement.lang:'en';
    const {page,error}=await api.getPublishedContentPage(route,locale);
    if(error||!page?.content)return;
    const content=page.content;
    const article=document.createElement('article');
    article.className='managed-page-content';
    article.innerHTML=`<header class="policy-header"><h1>${esc(content.title||page.title)}</h1></header><div class="managed-rich-text">${sanitize(content.body||'')}</div>`;
    const widgets=(page.widgets||[]).map(widgetMarkup).join('');
    if(widgets)article.insertAdjacentHTML('afterbegin',`<div class="managed-widgets">${widgets}</div>`);
    root.replaceChildren(article);
    const seo=page.seo||{};
    if(seo.title)document.title=seo.title;
    const description=document.querySelector('meta[name="description"]');
    if(description&&seo.description)description.content=seo.description;
    root.dataset.intoolsHydrated=String(page.revision||'published');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>hydrate().catch(()=>{}));
  else hydrate().catch(()=>{});
})();
