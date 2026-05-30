import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../../src/shared'),
      '@app': resolve(__dirname, './src')
    }
  },
  server: {
    port: 4721,
    strictPort: true
  },
  preview: {
    port: 4721,
    strictPort: true
  }
});
