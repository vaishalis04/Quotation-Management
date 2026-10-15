import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.TEST_API_URL || 'http://localhost:5700/api/v1';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 }, // the backend allows http://localhost:5173 by default (CORS)
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    globalSetup: ['./tests/globalSetup.js'],
    env: { VITE_API_URL: API },
    testTimeout: 40000,
    hookTimeout: 40000,
    fileParallelism: false,
  },
});
