// The test profile, unpacked only into out/test: what Playwright and `pnpm run window --packaged` start.
import base from './electron-builder.base.mjs'

/** @type {import('electron-builder').Configuration} */
export default { ...base, directories: { app: 'dist/test', output: 'out/test' } }
