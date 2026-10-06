import { defineConfig } from 'vitest/config'
import { testTiers } from '../../../vitest.tiers.mts'
export default defineConfig({ test: { ...testTiers(), include: ['tests/**/*.spec.ts'] } })
