import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // API local (apps/api, porta 8787) — mesmo caminho /api/v1 de produção
    proxy: { '/api': 'http://localhost:8787' },
  },
})
