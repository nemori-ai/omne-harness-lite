// What both packaged profiles share. Each leaf names its own app directory and output in full.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import afterPack from './scripts/fuses.ts'

const product = JSON.parse(readFileSync(new URL('./product.json', import.meta.url), 'utf8'))
const electron = createRequire(import.meta.url)('electron/package.json')

/** @type {import('electron-builder').Configuration} */
export default {
  appId: product.appId,
  productName: product.productName,
  electronVersion: electron.version,
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  files: ['**/*', '!**/*.map', '!**/*.modules.json', '!node_modules{,/**/*}'],
  afterPack,
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.developer-tools',
    identity: null,
    extendInfo: { NSMicrophoneUsageDescription: '按住录音时用麦克风录下你说的话，作为语音附件。' },
  },
  win: { target: ['nsis'] },
  // An assisted installer that lets the user choose the directory and a per-user or all-users
  // installation; nsis/installer.nsh keeps it and its uninstaller off files it did not install.
  nsis: {
    include: 'nsis/installer.nsh',
    artifactName: '${productName} Setup ${version}.${ext}',
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  linux: { target: ['deb', 'rpm'], category: 'Development' },
}
