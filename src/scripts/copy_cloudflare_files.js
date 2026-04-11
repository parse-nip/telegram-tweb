/**
 * After `vite build`, copies static assets into dist/ for Cloudflare Pages.
 *
 * vite.config has copyPublicDir: false (upstream build flow merges into public/).
 * We must copy public/static assets into dist/ or fonts, icons, masks, and
 * root workers (decoderWorker, etc.) 404 on deployed Pages.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');
const files = ['_redirects', '_headers'];

if(!fs.existsSync(distDir)) {
  console.warn('[copy_cloudflare_files] dist/ missing; skip (run pnpm build first).');
  process.exit(0);
}

function copyDirRecursive(src, dest) {
  if(!fs.existsSync(src)) return;
  fs.cpSync(src, dest, {recursive: true});
  console.log(`[copy_cloudflare_files] copied ${path.relative(rootDir, src)} -> ${path.relative(rootDir, dest)}`);
}

function copyFileIfExists(src, dest) {
  if(!fs.existsSync(src)) return;
  fs.copyFileSync(src, dest);
  console.log(`[copy_cloudflare_files] copied ${path.relative(rootDir, src)} -> ${path.relative(rootDir, dest)}`);
}

function copyPublicStaticAssets() {
  if(!fs.existsSync(publicDir)) {
    console.warn('[copy_cloudflare_files] public/ missing; skip static assets.');
    return;
  }

  copyDirRecursive(path.join(publicDir, 'assets'), path.join(distDir, 'assets'));
  copyDirRecursive(path.join(publicDir, 'changelogs'), path.join(distDir, 'changelogs'));
  copyDirRecursive(path.join(publicDir, 'rizz'), path.join(distDir, 'rizz'));

  const rootStaticFiles = [
    'decoderWorker.min.js',
    'decoderWorker.min.wasm',
    'waveWorker.min.js',
    'browserconfig.xml',
    'site.webmanifest',
    'site_apple.webmanifest',
    'version'
  ];

  for(const name of rootStaticFiles) {
    copyFileIfExists(path.join(publicDir, name), path.join(distDir, name));
  }
}

copyPublicStaticAssets();

for(const name of files) {
  const src = path.join(rootDir, name);
  const dest = path.join(distDir, name);
  if(fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`[copy_cloudflare_files] copied ${name} -> dist/`);
  }
}
