/**
 * TSCG Browser Bundle Config
 * Builds a browser-compatible ESM bundle of the optimizer.
 * Output: dist/tscg.browser.js (~15KB gzipped)
 */
import esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const result = await esbuild.build({
  entryPoints: ['src/browser.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'browser',
  target: 'ES2022',
  format: 'esm',
  outfile: 'dist/tscg.browser.js',
  treeShaking: true,
  metafile: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

// Print bundle analysis
const out = readFileSync('dist/tscg.browser.js');
const gzipped = gzipSync(out);

console.log('\nTSCG Browser Bundle Built:');
console.log(`  Output:     dist/tscg.browser.js`);
console.log(`  Size:       ${(out.length / 1024).toFixed(1)} KB`);
console.log(`  Gzipped:    ${(gzipped.length / 1024).toFixed(1)} KB`);
console.log(`  Format:     ESM`);
console.log(`  Target:     ES2022`);
console.log(`  Sourcemap:  dist/tscg.browser.js.map`);

// Show exports summary
const text = await esbuild.analyzeMetafile(result.metafile);
console.log('\nBundle Analysis:');
console.log(text);
