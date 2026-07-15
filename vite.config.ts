/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/survey-analyser-2/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // e2e/**.spec.ts are Playwright specs (Task 14), run via `npm run e2e`,
    // not vitest - playwright's test() isn't valid inside vitest's runner.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
