/**
 * Builds the MCP Apps itinerary widget (docs/mcp-app/PLAN.md §6) into ONE self-contained HTML
 * file: hosts load it from `resources/read`, so there is no server to fetch chunks from.
 *
 * `@` points at frontend/ so the widget renders the unchanged components/trip/* with the same
 * React install the app uses. `npm run build:widgets` then inlines dist/itinerary.html into a
 * TS module (scripts/emit-module.mjs) the gateway imports statically.
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const root = fileURLToPath(new URL('.', import.meta.url))
const frontend = fileURLToPath(new URL('..', import.meta.url))

// frontend/package.json has no "type": "module", so Vite bundles this config as CommonJS, and
// @tailwindcss/vite is ESM-only — a static import fails to `require` it. A dynamic import stays
// a real `import()` in that output.
export default defineConfig(async () => ({
  root,
  plugins: [react(), (await import('@tailwindcss/vite')).default(), viteSingleFile()],
  resolve: {
    alias: { '@': frontend },
  },
  // Defense in depth for security requirement 8: dependency debug/log/info calls can print protocol
  // payloads (the user's trip). They have no side effects, so esbuild may drop them. The widget's
  // own fixed-string console.warn/error stay. scripts/emit-module.mjs fails the build if any remain.
  esbuild: { pure: ['console.debug', 'console.log', 'console.info', 'console.trace'] },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./itinerary.html', import.meta.url)),
    },
  },
}))
