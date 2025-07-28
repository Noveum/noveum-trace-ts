import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'integrations/express': 'src/integrations/express.ts',
    'integrations/nextjs': 'src/integrations/nextjs.ts',
    'integrations/hono': 'src/integrations/hono.ts',
  },
  format: ['cjs', 'esm'],
  dts: false, // Temporarily disabled due to TypeScript strict mode issues
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2022',
  outDir: 'dist',
  external: [
    'express',
    'next',
    'hono',
    'fastify',
    '@hono/node-server',
  ],
  esbuildOptions(options) {
    options.conditions = ['module'];
  },
});

