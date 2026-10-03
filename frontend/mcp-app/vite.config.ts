/**
 * Builds the MCP Apps widgets (docs/mcp-app/PLAN.md §6), one bundle per `--mode`: the default mode
 * is the itinerary widget (entry src/main.tsx), `--mode library` is the Trip Library (entry
 * library/main.tsx). Each bundle is TWO fixed-name files, dist/<name>/<name>.js and
 * dist/<name>/<name>.css.
 *
 * v3: no longer one inlined HTML file. ChatGPT's widget service failed (HTTP 500 → "Could not
 * open this app") on the ~735 KB single-file resource, so the resource is now a small HTML shell
 * that loads these two files by absolute URL from our own origin (lib/mcp/widget/
 * itinerary-resource.ts). scripts/emit-module.mjs checks the build is exactly these two files — no
 * split chunk or emitted asset that would need a relative URL, which cannot resolve inside the
 * host's sandboxed srcdoc frame — copies them to public/mcp-widget/v3/ and writes the shell module.
 *
 * `@` points at frontend/ so the widget renders the unchanged components/trip/* with the same
 * React install the app uses.
 */
import { fileURLToPath } from 'node:url'
import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))
const frontend = fileURLToPath(new URL('..', import.meta.url))

const BUNDLES = {
  itinerary: './src/main.tsx',
  library: './library/main.tsx',
} as const

// frontend/package.json has no "type": "module", so Vite bundles this config as CommonJS, and
// @tailwindcss/vite is ESM-only — a static import fails to `require` it. A dynamic import stays
// a real `import()` in that output.
export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  const name: keyof typeof BUNDLES = mode === 'library' ? 'library' : 'itinerary'
  return {
    root,
    plugins: [react(), (await import('@tailwindcss/vite')).default()],
    resolve: {
      alias: { '@': frontend },
    },
    // Defense in depth for security requirement 8: dependency debug/log/info calls can print protocol
    // payloads (the user's trip). They have no side effects, so esbuild may drop them. The widget's
    // own fixed-string console.warn/error stay. scripts/emit-module.mjs fails the build if any remain.
    esbuild: { pure: ['console.debug', 'console.log', 'console.info', 'console.trace'] },
    build: {
      outDir: `dist/${name}`,
      emptyOutDir: true,
      // A JS entry, not an HTML page: the shell is written by emit-module, with absolute URLs.
      modulePreload: false,
      // One bundle on purpose (see above); React + the MCP SDK's protocol schemas are most of it.
      chunkSizeWarningLimit: 800,
      // Every image and font the CSS uses must be inlined (the kit's are small data: URIs); an
      // emitted file would be a third asset, which emit-module rejects.
      assetsInlineLimit: 100_000,
      rollupOptions: {
        input: fileURLToPath(new URL(BUNDLES[name], import.meta.url)),
        output: {
          format: 'es',
          inlineDynamicImports: true,
          entryFileNames: `${name}.js`,
          assetFileNames: (asset) => (asset.name?.endsWith('.css') ? `${name}.css` : '[name][extname]'),
        },
      },
    },
  }
})
