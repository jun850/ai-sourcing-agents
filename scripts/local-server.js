/* Local static host with the same clean-route contract as vercel.json. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { LocalFabricPreview } = require('./catalog/fabrics/local-preview');

const root = path.resolve(__dirname, '..');
const portIndex = process.argv.findIndex(value => value === '--port' || value === '--listen');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT) || 8090;
const mime = { '.css':'text/css', '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };
const localFabricPreview = new LocalFabricPreview();

function json(res,status,value) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'private, no-store', 'X-Robots-Tag':'noindex, nofollow, noarchive' });
  res.end(`${JSON.stringify(value)}\n`);
}

function localCatalog(req,res,url) {
  if (url.pathname === '/__local_catalog/products') {
    try {
      json(res,200,localFabricPreview.list({
        category:url.searchParams.get('category')||null,construction:url.searchParams.get('construction')||null,supplierSlug:url.searchParams.get('supplier')||null,
        page:url.searchParams.get('page'),pageSize:url.searchParams.get('page_size'),materials:url.searchParams.getAll('material'),
        country:url.searchParams.get('country')||null,regions:url.searchParams.getAll('region'),availability:url.searchParams.get('availability')||'all',
        minPrice:url.searchParams.has('min_price')?Number(url.searchParams.get('min_price')):null,maxPrice:url.searchParams.has('max_price')?Number(url.searchParams.get('max_price')):null,
        sort:url.searchParams.get('sort')||'recommended'
      }));
    } catch (error) { json(res,500,{error:'Local fabric preview is unavailable.',detail:error.message}); }
    return true;
  }
  const product=url.pathname.match(/^\/__local_catalog\/products\/([^/]+)$/);
  if (product) {
    const value=localFabricPreview.product(decodeURIComponent(product[1]));
    json(res,value?200:404,value||{error:'Preview product not found.'});
    return true;
  }
  if (url.pathname === '/__local_catalog/factories') {
    json(res,200,localFabricPreview.factories());
    return true;
  }
  const factory=url.pathname.match(/^\/__local_catalog\/factories\/([^/]+)$/);
  if (factory) {
    const value=localFabricPreview.factory(decodeURIComponent(factory[1]));
    json(res,value?200:404,value||{error:'Preview supplier not found.'});
    return true;
  }
  const media=url.pathname.match(/^\/__local_catalog\/media\/([^/]+)\/(\d+)$/);
  if (media) {
    const filename=localFabricPreview.media(decodeURIComponent(media[1]),Number(media[2]));
    if (!filename) { json(res,404,{error:'Preview media not found.'}); return true; }
    fs.readFile(filename,(error,file)=>{
      if (error) { json(res,error.code==='ENOENT'?404:500,{error:'Preview media is unavailable.'}); return; }
      res.writeHead(200,{ 'Content-Type':mime[path.extname(filename).toLowerCase()]||'application/octet-stream', 'Cache-Control':'private, no-store', 'X-Robots-Tag':'noindex, nofollow, noarchive' });
      res.end(file);
    });
    return true;
  }
  return false;
}

function rewrite(url) {
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/categories') return '/pages/categories.html';
  const category = pathname.match(/^\/categories\/([^/]+)(?:\/([^/]+))?$/);
  if (category) {
    if (category[2]) url.searchParams.set('l3', category[2]);
    url.searchParams.set('l2', category[1]);
    return '/pages/category.html';
  }
  return ({
    '/intools/dashboard':'/intools/dashboard.html',
    '/search':'/pages/search.html',
    '/about':'/pages/about.html',
    '/help-center':'/pages/help-center.html',
    '/legal':'/pages/legal.html',
    '/terms':'/pages/terms.html',
    '/privacy':'/pages/privacy.html',
    '/trust-safety':'/pages/trust-safety.html'
  })[pathname] || pathname;
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (localCatalog(req,res,url)) return;
  let pathname = rewrite(url);
  if (pathname === '/') pathname = '/index.html';
  const filename = path.resolve(root, '.' + pathname);
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filename, (error, file) => {
    if (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error'); return; }
    const headers = { 'Content-Type': `${mime[path.extname(filename).toLowerCase()] || 'application/octet-stream'}; charset=utf-8` };
    if (url.pathname.startsWith('/intools/')) {
      headers['Cache-Control'] = 'private, no-store, max-age=0';
      headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive';
      headers['Referrer-Policy'] = 'no-referrer';
      headers['X-Content-Type-Options'] = 'nosniff';
      headers['X-Frame-Options'] = 'SAMEORIGIN';
    }
    res.writeHead(200, headers);
    res.end(file);
  });
}).listen(port, () => console.log(`Atelix local server: http://localhost:${port}`));
