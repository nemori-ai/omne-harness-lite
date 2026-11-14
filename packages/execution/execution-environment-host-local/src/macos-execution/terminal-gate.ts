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
