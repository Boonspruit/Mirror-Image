import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The native build tree can contain thousands of generated files. Keep the
  // website watcher and dependency scan focused on the web entry point.
  // Cloud-backed Documents can emit change events when unchanged files are read.
  // Poll timestamps to avoid false reloads interrupting camera/profile capture.
  server: { watch: { usePolling: true, interval: 1000, ignored: ['**/apps/mobile/**', '**/.cache/**', '**/test-results/**', '**/.impeccable/**'] } },
  optimizeDeps: { entries: ['index.html'] },
})
