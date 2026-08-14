'use strict';

const TAXONOMY = Object.freeze({
  oem: Object.freeze(['clothing', 'accessories', 'socks']),
  fabrics: Object.freeze(['cotton', 'linen', 'polyester', 'viscose', 'knits', 'denim']),
  accessories: Object.freeze(['labels', 'hardware']),
  trims: Object.freeze(['zippers', 'buttons', 'interlining', 'lining', 'simple-trims']),
  yarns: Object.freeze(['cotton', 'polyester', 'viscose', 'wool', 'nylon'])
});

const membership = (l2, l3, terms) => Object.freeze({ l2, l3, terms: Object.freeze(terms) });

// These mappings are deliberately evidence-bound. Every term must occur in the
// corresponding ApparelX record or classification fails closed for review.
const CURATED = Object.freeze({
  '333z8': { primary: membership('oem', 'clothing', ['アパレル']), secondary: [membership('oem', 'accessories', ['バッグ'])] },
  '5DYI': { primary: membership('oem', 'clothing', ['生産を行っております']) },
  '7IM': { primary: membership('oem', 'clothing', ['アパレル製品']) },
  ALIANS: { primary: membership('oem', 'clothing', ['ユニフォーム']), secondary: [membership('oem', 'accessories', ['髪飾り'])] },
  BASI: { primary: membership('oem', 'clothing', ['apparel sourcing']) },
  BQELDV: { primary: membership('oem', 'clothing', ['オリジナルの洋服']) },
  CRAFT: { primary: membership('oem', 'clothing', ['ウェア製作']) },
  CANAL: { primary: membership('oem', 'accessories', ['帽子製造']) },
  DA1ITK: { primary: membership('oem', 'accessories', ['手袋・袋物・小物雑貨']) },
  DAN: { primary: membership('oem', 'clothing', ['メンズウェア']) },
  DONGS: {
    primary: membership('trims', 'simple-trims', ['tape', 'webbing']),
    secondary: [
      membership('yarns', 'cotton', ['cotton yarn']),
      membership('yarns', 'polyester', ['poly-span yarn'])
    ]
  },
  FET: { primary: membership('oem', 'accessories', ['バッグ']) },
  GEEKPE: { primary: membership('oem', 'clothing', ['アパレル製品']) },
  GEH: { primary: membership('oem', 'clothing', ['アパレル衣料全般']) },
  GMLEAJ: { primary: membership('oem', 'clothing', ['Leather Garments']), secondary: [membership('oem', 'accessories', ['Bags'])] },
  HPI1B: { primary: membership('oem', 'clothing', ['アパレル']) },
  IG6: {
    primary: membership('yarns', 'viscose', ['レーヨン']),
    secondary: [membership('oem', 'clothing', ['ドール用衣装'])]
  },
  IIC: { primary: membership('oem', 'clothing', ['アパレルの製造']), secondary: [membership('oem', 'accessories', ['レザープロダクト'])] },
  IKEGRA: { primary: membership('oem', 'accessories', ['帽子作成']) },
  IZ9S: { primary: membership('oem', 'clothing', ['衣料品輸出会社']), secondary: [membership('oem', 'accessories', ['bag'])] },
  j8687T: { primary: membership('oem', 'clothing', ['アパレルOEM生産']) },
  KAORIS: { primary: membership('oem', 'clothing', ['正絹着物']), secondary: [membership('oem', 'accessories', ['帽子'])] },
  L2B1: { primary: membership('oem', 'clothing', ['サンプル縫製']) },
  LWBGGK: {
    primary: membership('oem', 'clothing', ['肌着']),
    secondary: [
      membership('oem', 'socks', ['靴下']),
      membership('oem', 'accessories', ['手袋'])
    ]
  },
  MSTT: { primary: membership('oem', 'clothing', ['パターン・縫製']) },
  NANCY: { primary: membership('oem', 'clothing', ['国内縫製']) },
  NRF8: { primary: membership('oem', 'clothing', ['clothing manufacturer']) },
  OLIFE: { primary: membership('oem', 'clothing', ['ユニフォーム']), secondary: [membership('oem', 'accessories', ['バッグ'])] },
  PANAA: { primary: membership('oem', 'accessories', ['ヘアアクセサリー']) },
  SEGU: { primary: membership('oem', 'clothing', ['sports apparel manufacturer']) },
  THELU: { primary: membership('oem', 'clothing', ['clothing production']), secondary: [membership('oem', 'accessories', ['hat'])] },
  TTON: { primary: membership('oem', 'clothing', ['OEM量産']), secondary: [membership('oem', 'accessories', ['バッグ'])] },
  UKF: { primary: membership('oem', 'clothing', ['アパレル製品の製造']) },
  XSAKRU: { primary: membership('oem', 'clothing', ['パターンメーカー']) },
  Z4Y: { primary: membership('oem', 'clothing', ['衣類']), secondary: [membership('oem', 'accessories', ['帽子'])] }
});

const EVIDENCE_FIELDS = Object.freeze([
  'businessType',
  'businessOutline',
  'businessDescription',
  'sellingPoints',
  'businessTags',
  'partnerTags'
]);

function clean(value) {
  return String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function fieldText(record, field) {
  const value = record[field];
  return Array.isArray(value) ? value.map(clean).join(' | ') : clean(value);
}

function evidenceFor(record, terms) {
  const wanted = terms.map(clean).filter(Boolean);
  for (const field of EVIDENCE_FIELDS) {
    const value = fieldText(record, field);
    const lower = value.toLocaleLowerCase('und');
    for (const term of wanted) {
      const index = lower.indexOf(term.toLocaleLowerCase('und'));
      if (index !== -1) {
        const start = Math.max(0, index - 70);
        const end = Math.min(value.length, index + term.length + 70);
        return { field, term, excerpt: value.slice(start, end) };
      }
    }
  }
  return null;
}

function assertMembership(value) {
  if (!value || !TAXONOMY[value.l2] || !TAXONOMY[value.l2].includes(value.l3)) {
    throw new Error(`Unsupported taxonomy membership: ${JSON.stringify(value)}`);
  }
}

function decorateMembership(record, value, isPrimary) {
  assertMembership(value);
  const evidence = evidenceFor(record, value.terms);
  if (!evidence) {
    throw new Error(`${record.companyId}: taxonomy evidence not found for ${value.l2}/${value.l3}`);
  }
  return { l2: value.l2, l3: value.l3, isPrimary, evidence };
}

function fallbackClassification(record) {
  const clothing = evidenceFor(record, ['clothing', 'garment', 'apparel', '縫製', '衣料', '洋服', 'アパレル']);
  const accessories = evidenceFor(record, ['accessories', 'accessory', 'bag', 'wallet', 'hat', 'glove', '帽子', 'バッグ', '手袋', 'アクセサリー']);
  const socks = evidenceFor(record, ['socks', 'hosiery', '靴下']);
  const candidates = [
    clothing && { l2: 'oem', l3: 'clothing', isPrimary: false, evidence: clothing },
    accessories && { l2: 'oem', l3: 'accessories', isPrimary: false, evidence: accessories },
    socks && { l2: 'oem', l3: 'socks', isPrimary: false, evidence: socks }
  ].filter(Boolean);

  return {
    status: 'review_required',
    method: 'fallback_review',
    primary: null,
    memberships: [],
    candidates,
    reason: candidates.length
      ? 'No curated source-evidence rule exists; candidate memberships require review.'
      : 'No supported taxonomy evidence was found.'
  };
}

function classifySupplier(record) {
  const rule = CURATED[record.companyId];
  if (!rule) return fallbackClassification(record);

  if (rule.reviewReason) {
    const definitions = rule.reviewCandidates || [];
    const candidates = definitions.map(value => decorateMembership(record, value, false));
    const reviewEvidence = rule.reviewTerms ? evidenceFor(record, rule.reviewTerms) : null;
    return {
      status: 'review_required',
      method: 'curated_source_evidence',
      primary: null,
      memberships: [],
      candidates,
      reason: rule.reviewReason,
      reviewEvidence
    };
  }

  const primary = decorateMembership(record, rule.primary, true);
  const secondary = (rule.secondary || []).map(value => decorateMembership(record, value, false));
  return {
    status: 'classified',
    method: 'curated_source_evidence',
    primary: { l2: primary.l2, l3: primary.l3 },
    memberships: [primary, ...secondary],
    candidates: [],
    reason: null
  };
}

module.exports = { TAXONOMY, classifySupplier, evidenceFor };
