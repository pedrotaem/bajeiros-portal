// Bundle da Lambda (fase 11): tudo dentro (incl. @aws-sdk/client-rds-data, por
// determinismo — não depender da versão do SDK embutida no runtime). O runner de
// migração também é bundlado p/ o deploy rodar `node migrate.bundle.mjs` sem npm ci.
import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['pg-native'], // dep opcional do pg, nunca instalada
  // pg é CJS com require interno — em bundle ESM precisa de um require real
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  minify: false,
  sourcemap: false,
  logLevel: 'info',
}

await build({
  ...shared,
  entryPoints: ['src/lambda.ts'],
  outfile: 'dist/lambda/index.mjs',
})

await build({
  ...shared,
  entryPoints: ['scripts/migrate-data-api.mjs'],
  outfile: 'dist/lambda/migrate.bundle.mjs',
})
