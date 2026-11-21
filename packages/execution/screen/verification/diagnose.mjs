// One minute on a machine: does the screen backend of this system work here?
// usage: pnpm run build && node verification/diagnose.mjs
import { diagnoseScreen } from '../dist/index.js'

const diagnosis = await diagnoseScreen()
process.stdout.write(`${JSON.stringify(diagnosis, null, 2)}\n`)
const works = diagnosis.backend !== null && diagnosis.check.kind === 'passed'
process.exitCode = works && diagnosis.permission === 'satisfied' ? 0 : 1
