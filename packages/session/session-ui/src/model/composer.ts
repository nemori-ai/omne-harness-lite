import type { Run } from './session-machine.ts'

export type StopFace = 'none' | 'stop' | 'stopping' | 'confirm-stop'

export function stopFace(run: Run): StopFace {
  switch (run.kind) {
    case 'idle':
      return 'none'
    case 'running':
      return 'stop'
    case 'cancelling':
      return run.unknown ? 'confirm-stop' : 'stopping'
  }
}
