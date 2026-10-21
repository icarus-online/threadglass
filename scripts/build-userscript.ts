import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const css = await readFile('src/style.css', 'utf8');
const result = await build({
  entryPoints: ['src/local.tsx'],
  bundle: true,
  jsx: 'automatic',
  write: false,
  format: 'iife',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'inline-css',
      setup(b) {
        b.onResolve({ filter: /style\.css\?inline$/ }, () => ({
          path: 'style',
          namespace: 'inline-css',
        }));
        b.onLoad({ filter: /.*/, namespace: 'inline-css' }, () => ({
          contents: 'export default ' + JSON.stringify(css),
          loader: 'js',
        }));
      },
    },
  ],
});
const header = `// ==UserScript==
// @name         Threadglass Local Reader
// @namespace    https://github.com/icarus-online/threadglass
// @version      0.1.0
// @description  Read public discussion content already loaded in your browser. No network extraction.
// @match        https://www.reddit.com/r/*
// @match        https://old.reddit.com/r/*
// @match        https://m.reddit.com/r/*
// @match        https://sh.reddit.com/r/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==\n`;
await writeFile('dist/threadglass.user.js', header + result.outputFiles[0]!.text);
