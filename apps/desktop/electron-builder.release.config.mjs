// The release profile: the test profile with Electron's fuses flipped after packing. Its own
// output directory, so packing one profile never replaces the other's unpacked app.
import base from './electron-builder.config.mjs'
import afterPack from './scripts/fuses.mjs'

/** @type {import('electron-builder').Configuration} */
export default { ...base, directories: { ...base.directories, output: 'out/release' }, afterPack }
