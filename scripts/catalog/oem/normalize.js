'use strict';

const crypto = require('node:crypto');
const { TAXONOMY, classifySupplier } = require('./taxonomy');
const { normalizeSupplierLocation } = require('./location');

const SOURCE_NAME = 'apparelx';
const SOURCE_HOST = 'www.apparel-x.com';
const CONTACT_EMAIL = 'info@arcanawangsa.com';
const SCHEMA_VERSION = 1;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function nullableText(value, { multiline = false } = {}) {
  if (value === undefined || value === null) return null;
  let normalized = String(value).normalize('NFC').replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
  normalized = multiline
    ? normalized.split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    : normalized.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function uniqueText(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map(value => nullableText(value)).filter(value => {
    if (!value) return false;
    const key = value.toLocaleLowerCase('und');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalWebsite(value) {
  const text = nullableText(value);
  if (!text) return null;
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function canonicalSourceUrl(value) {
  const url = new URL(nullableText(value));
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== SOURCE_HOST) {
    throw new Error(`Unsupported source URL: ${value}`);
  }
  url.hostname = SOURCE_HOST;
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function publicMembership(value) {
  return { l2: value.l2, l3: value.l3, isPrimary: Boolean(value.isPrimary) };
}

function privateClassification(value) {
  return {
    status: value.status,
    method: value.method,
    primary: value.primary,
    memberships: value.memberships,
    candidates: value.candidates,
    reason: value.reason,
    reviewEvidence: value.reviewEvidence || null
  };
}

function sourceContact(supplierId, type, value, record) {
  const originalValue = nullableText(value);
  if (!originalValue) return null;
  return {
    supplierId,
    contactType: type,
    originalValue,
    normalizedValue: type === 'email' ? originalValue.toLocaleLowerCase('und') : originalValue,
    sourceUrl: canonicalSourceUrl(record.sourceUrl),
    sourceField: type,
    crawledAt: nullableText(record.__crawledAt),
    usageStatus: 'documented_only',
    outreachAllowed: false,
    publicVisibility: false
  };
}

function sourceMedia(supplierId, images, sourceUrl) {
  return (Array.isArray(images) ? images : []).map((image, index) => ({
    supplierId,
    assetId: `${supplierId}:media:${String(index + 1).padStart(2, '0')}`,
    kind: nullableText(image.kind),
    sourceUrl: canonicalSourceUrl(image.sourceUrl),
    localPath: nullableText(image.localPath),
    status: nullableText(image.status),
    bytes: Number.isFinite(image.bytes) ? image.bytes : null,
    contentType: nullableText(image.contentType),
    supplierSourceUrl: sourceUrl
  }));
}

function buildSupplier(record, crawledAt) {
  const sourceId = nullableText(record.companyId);
  const name = nullableText(record.companyName);
  if (!sourceId || !name) throw new Error('Every supplier requires companyId and companyName');
  const canonicalId = `${SOURCE_NAME}:${sourceId.toLocaleLowerCase('und')}`;
  const sourceUrl = canonicalSourceUrl(record.sourceUrl);
  const classification = classifySupplier(record);
  const location = normalizeSupplierLocation(record.address);
  const publicMedia = (Array.isArray(record.images) ? record.images : []).map((image, index) => ({
    assetId: `${canonicalId}:media:${String(index + 1).padStart(2, '0')}`,
    kind: nullableText(image.kind),
    storageUrl: null
  }));

  const supplier = {
    schemaVersion: SCHEMA_VERSION,
    id: canonicalId,
    slug: `apparelx-${sourceId.toLocaleLowerCase('und').replace(/[^a-z0-9]+/g, '-')}`,
    name,
    supplierType: nullableText(record.businessType),
    website: canonicalWebsite(record.website),
    address: nullableText(record.address),
    country: location.country,
    city: location.city,
    businessOutline: nullableText(record.businessOutline, { multiline: true }),
    description: nullableText(record.businessDescription, { multiline: true }),
    sellingPoints: nullableText(record.sellingPoints, { multiline: true }),
    tags: uniqueText(record.businessTags),
    partnerTags: uniqueText(record.partnerTags),
    annualSales: nullableText(record.annualSales),
    capital: nullableText(record.capital),
    establishedDate: nullableText(record.establishedDate),
    representative: nullableText(record.representative),
    employeeCount: nullableText(record.employeeCount),
    history: nullableText(record.history, { multiline: true }),
    banks: nullableText(record.banks, { multiline: true }),
    majorCustomers: nullableText(record.majorCustomers, { multiline: true }),
    moq: null,
    leadTime: null,
    capacity: null,
    certifications: null,
    price: null,
    taxonomy: {
      status: classification.status,
      primary: classification.primary,
      memberships: classification.memberships.map(publicMembership)
    },
    contactCta: {
      label: 'Contact supplier',
      destination: CONTACT_EMAIL,
      href: `mailto:${CONTACT_EMAIL}`
    },
    media: publicMedia,
    publicationStatus: classification.status === 'classified' ? 'ready_for_validation' : 'review_required'
  };

  const sourceRecord = {
    supplierId: canonicalId,
    source: SOURCE_NAME,
    sourceId,
    sourceUrl,
    sourceProfileAddress: nullableText(record.apparelXProfileAddress),
    sourceCompanyAbbreviation: nullableText(record.companyAbbreviation),
    crawledAt,
    classification: privateClassification(classification)
  };

  const recordWithTime = { ...record, __crawledAt: crawledAt };
  const privateContacts = [
    sourceContact(canonicalId, 'email', record.email, recordWithTime),
    sourceContact(canonicalId, 'phone', record.phone, recordWithTime),
    sourceContact(canonicalId, 'fax', record.fax, recordWithTime)
  ].filter(Boolean);

  return {
    supplier,
    sourceRecord,
    privateContacts,
    sourceMedia: sourceMedia(canonicalId, record.images, sourceUrl)
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertNoPrivateContactLeak(publicManifest, privateContacts) {
  const serialized = JSON.stringify(publicManifest);
  for (const contact of privateContacts) {
    if (contact.contactType === 'email' && serialized.toLocaleLowerCase('und').includes(contact.normalizedValue)) {
      throw new Error(`${contact.supplierId}: private email leaked into public manifest`);
    }
  }
  const publicEmails = serialized.match(EMAIL_RE) || [];
  if (publicEmails.some(value => value.toLocaleLowerCase('und') !== CONTACT_EMAIL)) {
    throw new Error('Public manifest contains an email other than the central Contact supplier destination');
  }
}

function normalizeManifest(input) {
  if (!input || !Array.isArray(input.records)) throw new Error('Input must contain a records array');
  const sourceHost = nullableText(input.metadata && input.metadata.sourceHost);
  if (sourceHost && sourceHost.toLowerCase() !== SOURCE_HOST) {
    throw new Error(`Unsupported source host: ${sourceHost}`);
  }
  const crawledAt = nullableText(input.metadata && input.metadata.crawledAt);
  const normalized = input.records.map(record => buildSupplier(record, crawledAt));
  const ids = normalized.map(item => item.supplier.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate canonical supplier identity detected');

  const nameKeys = normalized.map(item => item.supplier.name.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('und'));
  const duplicateNames = [...new Set(nameKeys.filter((value, index) => nameKeys.indexOf(value) !== index))];
  if (duplicateNames.length) throw new Error(`Duplicate normalized supplier name detected: ${duplicateNames.join(', ')}`);

  const suppliers = normalized.map(item => item.supplier);
  const sourceRecords = normalized.map(item => item.sourceRecord);
  const privateContacts = normalized.flatMap(item => item.privateContacts);
  const media = normalized.flatMap(item => item.sourceMedia);
  const reviewRequired = suppliers.filter(item => item.publicationStatus === 'review_required');
  const publicManifest = {
    metadata: {
      schemaVersion: SCHEMA_VERSION,
      source: SOURCE_NAME,
      sourceHost: SOURCE_HOST,
      sourceCrawledAt: crawledAt,
      supplierCount: suppliers.length,
      readyCount: suppliers.length - reviewRequired.length,
      reviewRequiredCount: reviewRequired.length,
      centralContact: CONTACT_EMAIL
    },
    suppliers
  };
  publicManifest.metadata.contentHash = sha256(publicManifest.suppliers);

  const privateManifest = {
    metadata: {
      schemaVersion: SCHEMA_VERSION,
      source: SOURCE_NAME,
      sourceHost: SOURCE_HOST,
      sourceCrawledAt: crawledAt,
      supplierCount: suppliers.length,
      contactCount: privateContacts.length,
      emailCount: privateContacts.filter(value => value.contactType === 'email').length,
      mediaCount: media.length
    },
    sourceRecords,
    privateContacts,
    media
  };
  privateManifest.metadata.contentHash = sha256({ sourceRecords, privateContacts, media });
  assertNoPrivateContactLeak(publicManifest, privateContacts);

  const taxonomyCounts = {};
  for (const supplier of suppliers) {
    const key = supplier.taxonomy.primary ? `${supplier.taxonomy.primary.l2}/${supplier.taxonomy.primary.l3}` : 'review_required';
    taxonomyCounts[key] = (taxonomyCounts[key] || 0) + 1;
  }
  const report = {
    schemaVersion: SCHEMA_VERSION,
    source: SOURCE_NAME,
    sourceCrawledAt: crawledAt,
    supplierCount: suppliers.length,
    readyCount: suppliers.length - reviewRequired.length,
    reviewRequiredCount: reviewRequired.length,
    reviewRequired: reviewRequired.map(item => ({ id: item.id, name: item.name })),
    taxonomyCounts,
    privateContactCount: privateContacts.length,
    privateEmailCount: privateContacts.filter(value => value.contactType === 'email').length,
    mediaCount: media.length,
    publicContentHash: publicManifest.metadata.contentHash,
    privateContentHash: privateManifest.metadata.contentHash
  };

  return { publicManifest, privateManifest, report };
}

module.exports = {
  CONTACT_EMAIL,
  SCHEMA_VERSION,
  SOURCE_HOST,
  TAXONOMY,
  canonicalWebsite,
  normalizeManifest,
  nullableText
};
