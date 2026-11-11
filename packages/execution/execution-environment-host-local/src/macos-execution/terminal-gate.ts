// The gate process of one persistent terminal on macOS: the script the terminal provider starts
// detached. It reads the control channel on file descriptor 3 and writes frames to standard output.
// Arguments: the domain name, the session reader, the spawn-helper, the FIFO directory. What the
// gate does is in `terminal-gate-run.ts`; this file only gives it the process's channels, node-pty's
// native fork and the process's exit. It is a script: nothing imports it.
import { createRequire } from 'node:module'
import { Socket } from 'node:net'
import { ptyFork } from '../terminal-gate-core.ts'
import { runTerminalGate } from './terminal-gate-run.ts'

const require = createRequire(import.meta.url)

runTerminalGate({
  control: new Socket({ fd: 3, readable: true, writable: false }),
  frames: process.stdout,
  unit: process.argv[2] ?? '',
  reader: process.argv[3] ?? '',
  helper: process.argv[4] ?? '',
  directory: process.argv[5] ?? '',
  pid: process.pid,
  ptyFork: () => ptyFork(require('node-pty')),
  atExit: close => void process.on('exit', close),
  exit: code => process.exit(code),
})
