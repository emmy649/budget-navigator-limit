import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/budget-navigator-limit/',   // важно за GitHub Pages
})
