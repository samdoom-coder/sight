import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: 'src/renderer',
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    svelte({
      preprocess: vitePreprocess()
    })
  ],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url))
    }
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/renderer/index.html', import.meta.url))
    }
  },
  server: {
    port: 5173,
    strictPort: false
  }
})
