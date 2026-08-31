import { createHash } from 'node:crypto';

export const APPARELX_ORIGIN = 'https://www.apparel-x.com';
export const makerListUrl = `${APPARELX_ORIGIN}/makerlist.php`;
export const makerApiUrl = `${APPARELX_ORIGIN}/php/GetApparelXMakerList.php?loginid=`;
export const businessApiUrl = (page, pageSize = 100) => `${APPARELX_ORIGIN}/php/GetApparelXBusinessList.php?loginid=&pageno=${page}&onepagecount=${pageSize}&datatype=json2`;

export const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
export const compact = (value) => clean(value).toLocaleLowerCase().replace(/[\s\-–—・.,/()]/g, '');
export const slugify = (value) => clean(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'apparelx-maker';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function isCanonicalApparelx(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === 'www.apparel-x.com' || parsed.hostname === 'apparel-x.com');
  } catch { return false; }
}

export function sourceUrlForMaker(code) {
  return `${APPARELX_ORIGIN}/search.php?maker=${encodeURIComponent(String(code))}`;
}

export function sourceUrlForBusiness(raw) {
  const segment = clean(raw?.ApparelXHomePageAddress) || clean(raw?.CompanyAbbreviation) || clean(raw?.Company);
  if (!segment || /[:/]/.test(segment)) throw new Error('Business profile address is missing or unsafe.');
  return `${APPARELX_ORIGIN}/business/${encodeURIComponent(segment)}`;
}

export function supplierTypeForOutline(outline) {
  const value = clean(outline).toLocaleLowerCase();
  if (/(yarn|糸|ヤーン)/i.test(value)) return 'yarn_supplier';
  if (/(fabric|textile|生地|織物|ニット|テキスタイル)/i.test(value)) return 'fabric_mill';
  if (/(button|zipper|fastener|interlining|lining|tape|shoulder pad|ボタン|ファスナー|芯地|裏地|テープ|肩パッド)/i.test(value)) return 'trim_supplier';
  if (/(buckle|accessor|parts|バックル|パーツ)/i.test(value)) return 'accessories_supplier';
  if (/(garment|apparel|cut and sew|clothing|縫製|アパレル|衣料)/i.test(value)) return 'garment_manufacturer';
  return 'textile_trading_company';
}

export function normalizeMaker(raw, observedAt) {
  const code = clean(raw?.MakerCode);
  const name = clean(raw?.MakerName);
  if (!code || !name) throw new Error('MakerCode and MakerName are required.');
  const outline = clean(raw?.BusinessOutline);
  const company = clean(raw?.Company);
  return {
    source_system: 'apparelx',
    source_record_id: code,
    source_url: sourceUrlForMaker(code),
    supplier: {
      slug: `apparelx-${slugify(company || 'maker')}-${slugify(code)}`.slice(0, 160),
      name,
      type: supplierTypeForOutline(outline),
      region: null,
      city: null,
      loc: null,
      verify_state: 'pending',
      certs: [],
      tags: outline ? [outline] : [],
      phone: null,
      web: null,
      bio: null,
    },
    private_contacts: [],
    provenance: [{ field_name: 'supplier', source_url: sourceUrlForMaker(code), value_origin: 'source', observed_at: observedAt }],
    source: { company, maker_code: code, maker_name: name, business_outline: outline },
  };
}

export function normalizeBusiness(raw, observedAt) {
  const code = clean(raw?.Company);
  const name = clean(raw?.CompanyFormalName);
  if (!code || !name) throw new Error('Company and CompanyFormalName are required.');
  const outline = clean(raw?.BusinessOutline);
  const tags = clean(raw?.BusinessTags).split(',').map(clean).filter(Boolean);
  return {
    source_system: 'apparelx', source_record_id: code, source_url: sourceUrlForBusiness(raw),
    supplier: { slug: `apparelx-business-${slugify(code)}`.slice(0, 160), name, type: supplierTypeForOutline(`${raw?.BusinessType || ''} ${outline} ${tags.join(' ')}`), region: null, city: null, loc: null, verify_state: 'pending', certs: [], tags: [...new Set([clean(raw?.BusinessType), outline, ...tags].filter(Boolean))], phone: null, web: null, bio: clean(raw?.BusinessDescription) || null },
    private_contacts: [],
    provenance: [{ field_name: 'supplier', source_url: sourceUrlForBusiness(raw), value_origin: 'source', observed_at: observedAt }],
    source: { company: code, maker_code: null, maker_name: name, business_outline: outline },
  };
}

export function extractApparelxProfileContacts(html, sourceUrl, observedAt) {
  const values = {};
  const pattern = /<div[^>]+class=["'][^"']*axsite_bodyarea_itemtitle[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class=["'][^"']*axsite_bodyarea_itemcontent[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = pattern.exec(String(html)))) values[clean(match[1].replace(/<[^>]+>/g, ' '))] = clean(match[2].replace(/<[^>]+>/g, ' '));
  const emails = values['Eメールアドレス'] ? [values['Eメールアドレス']] : extractContacts(html).emails;
  const phones = values.TEL ? [values.TEL] : extractContacts(html).phones;
  const website = values['公式サイトアドレス'] || '';
  return { contacts: contactRows({ emails, phones }, sourceUrl, observedAt).map((contact) => ({ ...contact, source_location: 'apparelx_business_profile' })), website };
}

export function extractContacts(html) {
  const text = clean(String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' '));
  const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((value) => value.toLowerCase()))]
    .filter((value) => !/(example\.|wixpress|sentry|schema\.org)/i.test(value));
  const phones = [...new Set((text.match(/(?:\+|00)[0-9][0-9 ()-]{7,}[0-9]|\b0[0-9][0-9 ()-]{7,}[0-9]/g) || []).map(clean))];
  return { emails, phones };
}

export function officialPageMatchesMaker(html, makerName) {
  const title = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const haystack = compact(`${title} ${String(html).replace(/<[^>]+>/g, ' ')}`);
  const needle = compact(makerName);
  return needle.length >= 3 && haystack.includes(needle);
}

export function contactRows(contacts, sourceUrl, observedAt) {
  return [
    ...contacts.emails.map((value) => ({ contact_type: 'email', original_value: value, normalized_value: value.toLowerCase(), source_url: sourceUrl, source_location: 'official_company_page', crawled_at: observedAt, validation_status: 'syntax_valid' })),
    ...contacts.phones.map((value) => ({ contact_type: 'phone', original_value: value, normalized_value: value.replace(/[^+0-9]/g, ''), source_url: sourceUrl, source_location: 'official_company_page', crawled_at: observedAt, validation_status: 'syntax_valid' })),
  ];
}

export function csvEscape(value) {
  const text = Array.isArray(value) ? value.join('|') : value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n') + '\n';
}
