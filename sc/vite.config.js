import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000', // Proxy API requests
      '/ws': {
        target: 'ws://localhost:3001', // Proxy WebSocket
        ws: true
      }
    }
  }
});