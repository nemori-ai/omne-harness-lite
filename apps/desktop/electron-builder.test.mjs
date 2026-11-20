// The test profile, unpacked only into out/test: what Playwright and `pnpm run start:test --packaged`
// start. It packs the bundles `pnpm run build:test` left in dist/test, without building them again.
import base from './electron-builder.base.mjs'
import { requireBuilt } from './scripts/build-profile.ts'

requireBuilt('test', import.meta.dirname)

/** @type {import('electron-builder').Configuration} */
export default { ...base, directories: { app: 'dist/test', output: 'out/test' } }
