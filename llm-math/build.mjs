// Builds the npm package: one ES module, and declarations whose imports name .js files.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  legalComments: 'none',
  logLevel: 'info',
});
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { stdio: 'inherit' });

// The source imports its siblings as .ts; the published declarations must name what ships.
for (const file of readdirSync('dist').filter((f) => f.endsWith('.d.ts'))) {
  const path = `dist/${file}`;
  writeFileSync(path, readFileSync(path, 'utf8').replace(/(from '\.\/[\w-]+)\.ts'/g, "$1.js'"));
}
