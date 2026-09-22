import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The legacy UI uses Leaflet and Web APIs whose community typings expose `any`.
      // Runtime-critical code remains TypeScript-checked with `tsc --noEmit`.
      '@typescript-eslint/no-explicit-any': 'off',
      // Several mount/restore effects intentionally hydrate browser-only state.
      'react-hooks/set-state-in-effect': 'off',
      // Admin preview accepts an operator-provided HTTPS image URL.
      '@next/next/no-img-element': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'public/maplibre/**', 'next-env.d.ts']),
])

export default eslintConfig
