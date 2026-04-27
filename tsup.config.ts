import { defineConfig } from 'tsup'
import { chmodSync, existsSync, readFileSync } from 'fs'

// Read version once at build time so the CLI always reports the correct version
// without needing to read package.json at runtime (which breaks on global installs).
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    matchers: 'src/matchers.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Source maps aid debugging in development; excluded from npm publish via .npmignore
  sourcemap: true,
  splitting: false,
  // Tree-shaking removes unused metric/provider code from bundles
  treeshake: true,
  minify: false,
  target: 'node18',
  outDir: 'dist',
  // Peer dependencies are never bundled — users supply their own client
  external: ['@anthropic-ai/sdk', 'openai'],
  // Inject the package version as a build-time constant so CLI --version is always correct
  define: {
    __RAGEVAL_VERSION__: JSON.stringify(pkg.version),
  },
  // Make the CLI executable on Unix systems after every build
  async onSuccess() {
    if (process.platform !== 'win32' && existsSync('dist/cli/index.js')) {
      chmodSync('dist/cli/index.js', 0o755)
    }
  },
})
