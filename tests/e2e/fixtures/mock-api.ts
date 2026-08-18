import { Page } from '@playwright/test';

// Minimal product fixture that mirrors the shape produced by js/data.js
export const FAB_100 = {
  id: 'FAB-100',
  name: 'Organic Cotton Jersey 180gsm',
  cat: 'fabrics',
  badge: 'non-oem',
  comp: '100% Organic Cotton',
  spec: 'Jersey knit, 180 GSM',
  gsm: '180 GSM',
  moq: '200 yards',
  unit: 'yard',
  price: 4.8,
  seller: 'Greenfields Textile',
  loc: 'Surat, India',
  origin_country: 'India',
  img: 'https://placehold.co/600x600/eef2ee/2e4a3a?text=Organic+Cotton',
  certs: ['GOTS', 'Oeko-Tex'],
  supplierVerified: true,
  factorySlug: null,
  factoryId: null,
  description: 'Soft-hand organic cotton jersey, GOTS certified, suitable for T-shirts, jersey dresses, and activewear.',
  lead_time: '7–14 days',
  isPrivate: false,
};

// The localStorage key used by components.js for the cart
const CART_KEY = 'arcana_cart';
const SESSION_KEY = 'arcana_session';
const MERGED_KEY = `arcana_cart_merged_qa-user`;

export const MOCK_SESSION = { role: 'buyer', name: 'QA Buyer', avatarUrl: null };

export const MOCK_API_SCRIPT = `
(() => {
  const profile = {
    id: 'qa-user', email: 'qa@example.com', name: 'QA Buyer', full_name: 'QA Buyer',
    company_name: 'Atelix QA', country: 'Indonesia', role: 'buyer', handle: 'qa-buyer',
  };
  const addresses = [
    { id: 'addr-id', label: 'Bali office', recipient_name: 'QA Buyer',
      phone: '+62 812 0000 0000', line1: 'Jalan Sunset Road 88', line2: null,
      city: 'Denpasar', province: 'Bali', postal_code: '80221', country: 'Indonesia', is_default: true },
    { id: 'addr-jp', label: 'Tokyo showroom', recipient_name: 'QA Buyer',
      phone: '+81 3 0000 0000', line1: '2-1 Marunouchi', line2: null,
      city: 'Chiyoda', province: 'Tokyo', postal_code: '100-0005', country: 'Japan', is_default: false },
  ];
  let orders = [];
  const decorate = (api) => Object.assign(api, {
    getSessionProfile: async () => profile,
    getMyProfile: async () => profile,
    onChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    fetchCatalog: async () => ({ products: [], factories: [] }),
    getCart: async () => JSON.parse(localStorage.getItem('arcana_cart') || '[]'),
    replaceCart: async () => ({ error: null }),
    getWishlist: async () => [],
    replaceWishlist: async () => ({ error: null }),
    getMyOrders: async () => orders,
    getAddresses: async () => addresses.map(a => ({ ...a })),
    createAddress: async (p) => ({ address: { ...p, id: 'addr-new', is_default: false }, error: null }),
    updateAddress: async () => ({ error: null }),
    deleteAddress: async () => ({ error: null }),
    setDefaultAddress: async () => ({ error: null }),
    getShippingRates: async () => [
      { id: 'ship-id', country_code: 'ID', country_name: 'Indonesia', service_name: 'Tracked freight', flat_rate_usd: 42, eta_min_days: 4, eta_max_days: 7, is_active: true },
      { id: 'ship-jp', country_code: 'JP', country_name: 'Japan', service_name: 'Air freight', flat_rate_usd: 65, eta_min_days: 3, eta_max_days: 6, is_active: true },
    ],
    getShippingQuote: async (country) => ({
      quote: country === 'Indonesia'
        ? { id: 'ship-id', country_code: 'ID', country_name: 'Indonesia', service_name: 'Tracked freight', flat_rate_usd: 42, eta_min_days: 4, eta_max_days: 7 }
        : { id: 'ship-jp', country_code: 'JP', country_name: 'Japan', service_name: 'Air freight', flat_rate_usd: 65, eta_min_days: 3, eta_max_days: 6 },
      error: null,
    }),
    updateProfile: async () => ({ error: null }),
    updateEmail: async () => ({ error: null }),
    uploadImage: async () => ({ error: { message: 'Upload not available in QA' } }),
    placeOrder: async (payload) => {
      window.__qaOrderPayload = payload;
      const no = 'QA-TEST-001';
      orders.push({ order_no: no, status: 'pending', ...payload });
      return { orderNo: no, error: null };
    },
    getPublicProduct: async (id) => {
      const fab100 = { id: 'FAB-100', name: 'Organic Cotton Jersey 180gsm', cat: 'fabrics', badge: 'non-oem', comp: '100% Organic Cotton', spec: 'Jersey knit, 180 GSM', gsm: '180 GSM', moq: '200 yards', unit: 'yard', price: 4.8, seller: 'Greenfields Textile', loc: 'Surat, India', origin_country: 'India', img: 'https://placehold.co/600x600/eef2ee/2e4a3a?text=Organic+Cotton', images: ['https://placehold.co/600x600/eef2ee/2e4a3a?text=Organic+Cotton'], certs: ['GOTS', 'Oeko-Tex'], supplierVerified: true, description: 'Soft-hand organic cotton jersey, GOTS certified.', lead_time: '7-14 days', isPrivate: false, factorySlug: null, factoryId: null };
      return id === 'FAB-100' ? fab100 : null;
    },
    fetchCatalogPage: async () => ({ products: [], total: 0, page: 1, pageSize: 24 }),
  });
  let value;
  Object.defineProperty(window, 'ARCANA_API', {
    configurable: true, get: () => value, set: api => { value = decorate(api); },
  });
  try {
    localStorage.setItem('arcana_session', JSON.stringify({ role: 'buyer', name: 'QA Buyer', avatarUrl: null }));
    localStorage.setItem('arcana_cart_merged_qa-user', '1');
  } catch (_) {}
})();
`;

// Inject the mock API before any page script runs
export async function injectMockApi(page: Page) {
  await page.addInitScript(MOCK_API_SCRIPT);
}

// Seed the cart in localStorage and inject session
export async function seedCart(page: Page, items = [{ id: 'FAB-100', qty: 200, key: 'FAB-100', options: {} }]) {
  await page.addInitScript(`
    try {
      localStorage.setItem('arcana_cart', JSON.stringify(${JSON.stringify(items)}));
      localStorage.setItem('arcana_cart_merged_qa-user', '1');
      localStorage.setItem('arcana_session', JSON.stringify({ role: 'buyer', name: 'QA Buyer', avatarUrl: null }));
    } catch(_) {}
  `);
}
