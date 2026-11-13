// The composer's one action slot: send and stop are one button with three faces. Adapted from
// super-assistant `src/desktop/src/renderer/src/conversation/composer-action.ts` (`composerAction`):
// the face is read off the run axis of the state machine, never off a clock.
import type { Run } from './session-machine.ts'

export type ComposerAction =
  | Readonly<{ kind: 'send'; disabled: boolean }>
  | Readonly<{ kind: 'stop'; disabled: false; confirming: boolean }>
  | Readonly<{ kind: 'stopping'; disabled: true }>

export function composerAction(run: Run, text: string): ComposerAction {
  switch (run.kind) {
    case 'idle':
      return { kind: 'send', disabled: text.trim().length === 0 }
    case 'running':
      return { kind: 'stop', disabled: false, confirming: false }
    case 'cancelling':
      // An unknown cancel can be pressed again: it asks again under the same control id.
      return run.unknown
        ? { kind: 'stop', disabled: false, confirming: true }
        : { kind: 'stopping', disabled: true }
  }
}
