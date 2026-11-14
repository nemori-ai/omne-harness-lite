// The stop button's face, read off the run axis of the state machine and never off a clock.
// Adapted from super-assistant `src/desktop/src/renderer/src/conversation/composer-action.ts`
// (`composerAction`). Sending stays open in every face: a person can keep typing while a run goes.
import type { Run } from './session-machine.ts'

export type StopFace = 'none' | 'stop' | 'stopping' | 'confirm-stop'

export function stopFace(run: Run): StopFace {
  switch (run.kind) {
    case 'idle':
      return 'none'
    case 'running':
      return 'stop'
    case 'cancelling':
      // An unknown cancel can be pressed again: it asks again under the same control id.
      return run.unknown ? 'confirm-stop' : 'stopping'
  }
}
