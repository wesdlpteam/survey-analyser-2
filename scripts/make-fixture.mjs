// Writes the shared fixture workbook to a gitignored scratch path, so a real
// browser session (dev server) has an actual .xlsx file to drop/select for
// live verification. Never commit the output - scratch/ is gitignored and
// *.xlsx is gitignored repo-wide.
//
// The project's TS source uses extensionless, bundler-style imports, which
// Node's native --experimental-strip-types loader can't resolve directly, so
// this uses Vite (already a devDependency) to bundle just
// src/fixtures/build.ts into a temporary ESM file, imports that, then
// deletes the temporary bundle.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const outDir = path.join(root, 'scratch');
const bundleDir = path.join(outDir, '.fixture-bundle');

mkdirSync(outDir, { recursive: true });

await build({
  root,
  logLevel: 'silent',
  build: {
    write: true,
    outDir: bundleDir,
    emptyOutDir: true,
    lib: {
      entry: path.join(root, 'src/fixtures/build.ts'),
      formats: ['es'],
      fileName: () => 'build.mjs',
    },
    rollupOptions: {
      external: ['xlsx'],
    },
  },
});

const bundleUrl = pathToFileURL(path.join(bundleDir, 'build.mjs')).href;
const { buildFixtureWorkbook } = await import(bundleUrl);

const outFile = path.join(outDir, 'fixture.xlsx');
writeFileSync(outFile, Buffer.from(buildFixtureWorkbook()));
rmSync(bundleDir, { recursive: true, force: true });

console.log(`Wrote fixture workbook to ${outFile}`);
