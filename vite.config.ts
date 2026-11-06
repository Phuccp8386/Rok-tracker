import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path: set VITE_BASE_PATH for a project site (e.g. /Rok-Tracker/).
// Leave empty for a user/organisation site served at the domain root.
const base = process.env.VITE_BASE_PATH ?? ''

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
