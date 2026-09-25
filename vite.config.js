import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The native build tree can contain thousands of generated files. Keep the
  // website watcher and dependency scan focused on the web entry point.
  server: { watch: { ignored: ['**/apps/mobile/**'] } },
  optimizeDeps: { entries: ['index.html'] },
})
