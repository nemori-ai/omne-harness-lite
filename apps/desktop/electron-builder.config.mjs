// The test profile: what electron-builder packs from `dist/app`, staged by scripts/package.mjs.
// No fuses are flipped, so Playwright's Electron driver can attach to it; ship the release profile.
// Unsigned on all three platforms: signing and notarization come with certificates.
import { createRequire } from 'node:module'

const electron = createRequire(import.meta.url)('electron/package.json')

export const PRODUCT = Object.freeze({
  name: 'omne',
  productName: 'omne',
  appId: 'ai.nemori.omne',
  homepage: 'https://github.com/nemori-ai/omne-harness-lite',
})

/** @type {import('electron-builder').Configuration} */
export default {
  appId: PRODUCT.appId,
  productName: PRODUCT.productName,
  electronVersion: electron.version,
  directories: { app: 'dist/app', output: 'out' },
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  // Everything the app runs is bundled into dist/app; the workspace's node_modules stay out.
  files: ['**/*', '!node_modules{,/**/*}'],
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.developer-tools',
    identity: null,
  },
  win: { target: ['nsis'] },
  linux: { target: ['deb', 'rpm'], category: 'Development' },
}
