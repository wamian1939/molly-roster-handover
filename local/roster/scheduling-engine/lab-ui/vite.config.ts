import { defineConfig } from 'vite'

export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:4188', '/multi-api': 'http://127.0.0.1:4190' } },
  build: { outDir: 'dist', rollupOptions: { input: { lab: 'index.html', multiAgent: 'multi-agent.html' } } }
})
