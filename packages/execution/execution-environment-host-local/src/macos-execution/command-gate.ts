// The gate process of one host command on macOS: the script the command manager starts detached.
// It reads the control channel on file descriptor 3 and writes frames to standard output.
// Arguments: the domain name, the session reader. What the gate does is in `command-gate-run.ts`;
// this file only gives it the process's channels. It is a script: nothing imports it.
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
