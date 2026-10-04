import { defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'
export default defineConfig({test:{...testTiers(),include:['tests/**/*.spec.ts'],typecheck:{enabled:true,include:['tests/**/*.spec-d.ts'],tsconfig:'./tsconfig.test.json'}}})
