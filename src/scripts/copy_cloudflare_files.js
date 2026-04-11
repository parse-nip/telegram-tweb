/**
 * Copies Cloudflare Pages static config into dist/ after Vite build.
 * (vite.config has copyPublicDir: false, so we copy only these files.)
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const distDir = path.join(rootDir, 'dist');
const files = ['_redirects', '_headers'];

if(!fs.existsSync(distDir)) {
  console.warn('[copy_cloudflare_files] dist/ missing; skip (run pnpm build first).');
  process.exit(0);
}

for(const name of files) {
  const src = path.join(rootDir, name);
  const dest = path.join(distDir, name);
  if(fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`[copy_cloudflare_files] copied ${name} -> dist/`);
  }
}
