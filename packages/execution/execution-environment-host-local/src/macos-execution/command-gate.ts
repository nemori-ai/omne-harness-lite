import { Socket } from 'node:net'
import { runCommandGate } from './command-gate-run.ts'

runCommandGate({
  control: new Socket({ fd: 3, readable: true, writable: false }),
  frames: process.stdout,
  unit: process.argv[2] ?? '',
  reader: process.argv[3] ?? '',
  pid: process.pid,
  exit: code => process.exit(code),
})
