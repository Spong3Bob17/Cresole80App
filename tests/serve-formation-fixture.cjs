const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixture = fs.readFileSync(path.join(__dirname, 'formation-browser-fixture.js'), 'utf8');
function renderFixture() { return fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('</head>', `<script>${fixture}</script></head>`).replace('<title>Cresole 80 - Suite</title>', '<title>Cresole 80 — Test campetto (dati fittizi)</title>'); }
if (process.argv.includes('--file')) {
  const output = path.join(__dirname, '.generated-formation-browser.html');
  fs.writeFileSync(output, renderFixture()); console.log(output); process.exit(0);
}
const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] !== '/') { res.writeHead(404); res.end('Risorsa non presente nella prova'); return; }
  const html = renderFixture();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html);
});
server.listen(4173, '127.0.0.1', () => console.log('Test isolato del campetto: http://127.0.0.1:4173/ — nessuna scrittura sui fogli reali'));
