// Updates the ?v= cache-busting hashes in index.html after editing any asset.
// Usage: node tools/stamp-assets.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = ['icon.svg', 'fonts/pretendard/pretendard.css', 'styles.css', 'catalog.js', 'portraits.js', 'mounts.js', 'support.js', 'support-req.js', 'gifts.js', 'recruit.js', 'sync.js', 'core.js', 'app.js'];
let html = readFileSync(join(root, 'index.html'), 'utf8');
for (const name of assets) {
  const hash = createHash('sha256').update(readFileSync(join(root, name))).digest('hex').slice(0, 12);
  html = html.replace(new RegExp(`${name.replace(/[.\/]/g, '\\$&')}\\?v=[^"']+`, 'g'), `${name}?v=${hash}`);
}
writeFileSync(join(root, 'index.html'), html);
console.log('index.html asset hashes updated');
