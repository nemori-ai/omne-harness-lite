// The release profile: the test profile with Electron's fuses flipped after packing.
import base from './electron-builder.config.mjs'
import afterPack from './scripts/fuses.mjs'

/** @type {import('electron-builder').Configuration} */
export default { ...base, afterPack }
