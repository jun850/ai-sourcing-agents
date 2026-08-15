(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ATELIX_CATALOG_TAXONOMY=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const LOCALES=['en','ja','zh'];
  const CONSTRUCTIONS=[
    ['plain-weave','Plain weave','平織り','平纹'],
    ['twill-drill','Twill & drill','綾織り・ドリル','斜纹与卡其'],
    ['denim-chambray','Denim & chambray','デニム・シャンブレー','牛仔与青年布'],
    ['canvas-duck','Canvas & duck','キャンバス・ダック','帆布'],
    ['satin','Satin','サテン','缎纹'],
    ['jacquard-dobby','Jacquard & dobby','ジャカード・ドビー','提花与多臂'],
    ['jersey-pique','Jersey & pique','天竺・鹿の子','针织汗布与珠地'],
    ['fleece-terry','Fleece & terry','フリース・裏毛','抓绒与毛圈'],
    ['rib-knit','Rib knit','リブニット','罗纹针织'],
    ['interlock-double-knit','Interlock & double knit','インターロック・ダブルニット','双面针织'],
    ['mesh-tricot','Mesh & tricot','メッシュ・トリコット','网眼与经编'],
    ['lace-tulle','Lace & tulle','レース・チュール','蕾丝与网纱'],
    ['chiffon-organza','Chiffon & organza','シフォン・オーガンジー','雪纺与欧根纱'],
    ['gauze','Gauze','ガーゼ','纱布'],
    ['corduroy','Corduroy','コーデュロイ','灯芯绒'],
    ['melton-tweed','Melton & tweed','メルトン・ツイード','麦尔登与粗花呢'],
    ['crepe','Crepe','クレープ','绉布'],
    ['artificial-leather','Artificial leather','人工皮革','人造革'],
    ['specialty-other','Specialty & other','特殊素材・その他','特殊面料与其他']
  ].map(([slug,en,ja,zh])=>Object.freeze({slug,label:Object.freeze({en,ja,zh})}));

  const RULES=[
    ['artificial-leather',/artificial leather|synthetic leather|faux leather|pu leather|pvc leather|合皮/i],
    ['denim-chambray',/denim|chambray|dungaree|indigo/i],['corduroy',/corduroy|wale/i],
    ['lace-tulle',/lace|tulle|net lace/i],['chiffon-organza',/chiffon|organza/i],
    ['mesh-tricot',/mesh|tricot|raschel/i],['interlock-double-knit',/interlock|double knit|ponte/i],
    ['rib-knit',/\brib(?:bed)?\b/i],['fleece-terry',/fleece|terry|brushed|boa|裏毛/i],
    ['jersey-pique',/jersey|pique|knit|天竺|鹿の子/i],['jacquard-dobby',/jacquard|dobby|herringbone/i],
    ['twill-drill',/twill|drill|gabardine|serge|綾織/i],['canvas-duck',/canvas|duck cloth/i],
    ['satin',/satin|sateen/i],['chiffon-organza',/chiffon|organza/i],['gauze',/gauze|double gauze/i],
    ['melton-tweed',/melton|tweed|flannel/i],['crepe',/crepe|cr[eê]pe/i],['plain-weave',/plain weave|broadcloth|poplin|taffeta|sheeting/i]
  ];
  const ALIASES=Object.freeze({cotton:'plain-weave',linen:'plain-weave',polyester:'specialty-other',viscose:'specialty-other',knits:'jersey-pique',denim:'denim-chambray'});

  function classify(input){
    const text=[input?.construction,input?.organization,input?.subcategory,input?.name,input?.description].filter(Boolean).join(' ');
    const match=RULES.find(([,pattern])=>pattern.test(text));
    return match?match[0]:'specialty-other';
  }
  function normalizeSlug(value){
    const slug=String(value||'').trim().toLowerCase();
    return ALIASES[slug]||CONSTRUCTIONS.some(item=>item.slug===slug)&&slug||'specialty-other';
  }
  function label(slug,locale='en'){
    const item=CONSTRUCTIONS.find(entry=>entry.slug===normalizeSlug(slug))||CONSTRUCTIONS.at(-1);
    return item.label[LOCALES.includes(locale)?locale:'en']||item.label.en;
  }
  return Object.freeze({ALIASES,CONSTRUCTIONS,LOCALES,classify,label,normalizeSlug});
});
