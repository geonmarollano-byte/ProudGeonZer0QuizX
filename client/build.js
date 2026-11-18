import { build, context } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const watch = process.argv.includes('--watch');
const options = {
  absWorkingDir: root,
  entryPoints: { app: 'src/main.jsx' },
  bundle: true,
  jsx: 'automatic',
  format: 'esm',
  target: ['es2022'],
  minify: !watch,
  outdir: 'dist/assets',
  logLevel: 'info',
  loader: { '.woff2': 'file' },
  assetNames: '[name]-[hash]',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
};
await mkdir(`${root}dist`, { recursive: true });
await cp(`${root}public`, `${root}dist`, { recursive: true });
for (const font of ['dm-sans', 'space-grotesk']) {
  await cp(
    fileURLToPath(import.meta.resolve(`@fontsource-variable/${font}/LICENSE`)),
    `${root}dist/assets/${font}-LICENSE.txt`,
  );
}
await cp(`${root}index.html`, `${root}dist/index.html`);
if (watch) await (await context(options)).watch();
else await build(options);
