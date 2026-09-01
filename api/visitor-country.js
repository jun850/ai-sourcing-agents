/* Vercel attaches the ISO country code at the edge. This endpoint deliberately
   returns only a coarse country and an exchange rate; no IP is persisted. */
export default async function handler(request, response) {
  const country = String(request.headers['x-vercel-ip-country'] || '').toUpperCase();
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (country !== 'ID') {
    response.status(200).json({ currency: 'USD', rate: 1 });
    return;
  }
  try {
    const rateResponse = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!rateResponse.ok) throw new Error('rate request failed');
    const payload = await rateResponse.json();
    const rate = Number(payload && payload.rates && payload.rates.IDR);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('invalid IDR rate');
    response.status(200).json({ country: 'ID', currency: 'IDR', rate });
  } catch (_) {
    response.status(200).json({ country: 'ID', currency: 'USD', rate: 1 });
  }
}
