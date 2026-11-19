import { createRequire } from 'node:module'

/** The Electron binary of this workspace. */
export const electronBinary = createRequire(import.meta.url)('electron')

// Variables that change what the Electron binary is. A shell that has them set (an editor's
// terminal, another Electron app's child) would start Node, or a debugger, instead of the app.
const INHERITED = ['ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ATTACH_CONSOLE', 'NODE_OPTIONS']

/** The environment for the app's process: the caller's, without the variables above. */
export function electronEnvironment(env, extra = {}) {
  const clean = { ...env, ...extra }
  for (const name of INHERITED) delete clean[name]
  return clean
}
