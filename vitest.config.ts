import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: { $lib: '/src/lib' },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
