import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { actionAt, chordOf, keymapOf, type KeyPress } from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import type { ReactNode } from 'react'
import { CallControls } from './model/call-controls.ts'
import { ComposerHandles, composerOf, type SendWay } from './model/composer-handles.ts'
import { sessionActions, type SessionActionDeps } from './model/session-actions.ts'
import type { SessionWorkspaces } from './model/session-workspaces.ts'
import { CallControlContext, type CallControlSlot } from './view/block-slot.ts'
import { ComposerKeysContext, type ComposerKeys } from './view/composer.tsx'

const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
const WAYS: Readonly<Record<string, SendWay>> = {
  'session.send': 'send',
  'session.send-first': 'first',
  'session.send-after': 'after',
}

/** Puts the session module's actions, and gives what the conversation page needs for keys and buttons to reach them. */
export function sessionKeys(
  shell: ShellService,
  workspaces: SessionWorkspaces,
  client: ClientOf<SessionProtocol>,
  pages: SessionActionDeps['pages'],
) {
  const handles = new ComposerHandles()
  const scope = (): string | undefined => shell.scope.get()
  const actions = sessionActions({
    scope,
    driver: () => {
      const now = scope()
      return now === undefined ? undefined : workspaces.peek(now)
    },
    composer: handles,
    calls: new CallControls(client),
    show: page => shell.navigate(page),
    pages,
  })
  const tell = (title: string): void =>
    shell.toast({ id: 'session-action', tone: 'attention', title })
  const run = (id: string): void => {
    const action = actions.find(item => item.id === id)
    if (action === undefined) return
    const can = action.available()
    if (can !== true) return tell(can)
    Promise.resolve()
      .then(action.run)
      .catch((error: unknown) => tell(error instanceof Error ? error.message : action.title))
  }
  const composer: ComposerKeys = {
    handles,
    wayOf: (press: KeyPress) => {
      const chord = chordOf(press, MAC)
      if (chord === null) return null
      const changes = shell.items('keymap')[0]?.changes() ?? {}
      const id = actionAt(keymapOf(shell.items('actions'), changes, MAC), 'composer', chord)
      return id === undefined ? null : (WAYS[id] ?? null)
    },
  }
  const calls: CallControlSlot = {
    background: () => run('session.background'),
    stop: () => run('session.stop-call'),
  }
  const around = (page: ReactNode): ReactNode => (
    <ComposerKeysContext.Provider value={composer}>
      <CallControlContext.Provider value={calls}>{page}</CallControlContext.Provider>
    </ComposerKeysContext.Provider>
  )
  for (const action of actions) shell.contribute('actions', action)
  return { around, composer: composerOf(handles) }
}
