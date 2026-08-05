import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: '/gmnotes/',
  plugins: [
    react(),
    viteSingleFile({
      removeViteModuleLoader: true,
      inlinePattern: ['**/*.{js,css}']
    })
  ],
  build: {
    outDir: 'build',
    emptyOutDir: true,
    target: 'es2018',
    cssCodeSplit: false,
    rollupOptions: {
      input: { main: './gmnotes.html' },
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined
      }
    }
  }
});
