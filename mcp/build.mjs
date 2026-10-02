// Builds the npm binary: one ES module with @nodegrove/llm-math bundled in, so the
// published package depends only on the MCP SDK and zod. The Worker is bundled by wrangler.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/stdio.ts'],
  outfile: 'dist/stdio.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  external: ['@modelcontextprotocol/server', '@modelcontextprotocol/server/*', 'zod'],
  legalComments: 'none',
  logLevel: 'info',
});
