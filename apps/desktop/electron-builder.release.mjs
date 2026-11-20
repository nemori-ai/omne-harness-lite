// The release profile, unpacked or as installers into out/release: the only one that ships.
import base from './electron-builder.base.mjs'

/** @type {import('electron-builder').Configuration} */
export default { ...base, directories: { app: 'dist/release', output: 'out/release' } }
