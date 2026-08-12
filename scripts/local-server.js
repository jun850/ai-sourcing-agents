/* Local static host with the same clean-route contract as vercel.json. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const portIndex = process.argv.findIndex(value => value === '--port' || value === '--listen');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT) || 8090;
const mime = { '.css':'text/css', '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };

function rewrite(url) {
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/categories') return '/pages/categories.html';
  const category = pathname.match(/^\/categories\/([^/]+)(?:\/([^/]+))?$/);
  if (category) {
    if (category[2]) url.searchParams.set('l3', category[2]);
    url.searchParams.set('l2', category[1]);
    return '/pages/category.html';
  }
  return ({ '/search':'/pages/search.html', '/about':'/pages/about.html', '/help-center':'/pages/help-center.html' })[pathname] || pathname;
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = rewrite(url);
  if (pathname === '/') pathname = '/index.html';
  const filename = path.resolve(root, '.' + pathname);
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filename, (error, file) => {
    if (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error'); return; }
    res.writeHead(200, { 'Content-Type': `${mime[path.extname(filename).toLowerCase()] || 'application/octet-stream'}; charset=utf-8` });
    res.end(file);
  });
}).listen(port, () => console.log(`Atelix local server: http://localhost:${port}`));
