import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'; // Make sure this line is present

export default defineConfig({
  plugins: [react()], // Ensure 'react()' is in the plugins array
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  base: '/', // This helps with asset paths like index.css
});