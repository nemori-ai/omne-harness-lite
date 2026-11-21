// The release profile, unpacked or as installers into out/release: the only one that ships. It packs
// the bundles `pnpm run build` left in dist/release, without building them again.
import base from './electron-builder.base.mjs'
import { requireBuilt } from './scripts/build-profile.ts'
import artifactBuildCompleted from './scripts/installer-receipt.ts'

requireBuilt('release', import.meta.dirname)

/** @type {import('electron-builder').Configuration} */
export default {
  ...base,
  directories: { app: 'dist/release', output: 'out/release' },
  artifactBuildCompleted,
}
