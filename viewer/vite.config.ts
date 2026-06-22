import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // .env lives in the gdoc root (one up), shared with the CLI.
  envDir: '..',
  // Allow importing ../shared/* (pure domain logic shared with the CLI).
  server: { fs: { allow: ['..'] } },
});
