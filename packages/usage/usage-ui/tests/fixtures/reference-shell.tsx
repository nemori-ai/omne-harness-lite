import { useEffect, useState, type ReactNode } from 'react'
import {
  type AttachedLayout,
  type ScopeSource,
  type ShellLogin,
} from '@omne-harness/shell-contract'
import { startShellOf, type Started } from '@omne-harness/shell-contract/testing'
import { ShellService } from '@omne-harness/shell-contract/cordis'

export class ReferenceShell extends ShellService {
  readonly navigated: string[] = []
  readonly login: ShellLogin = {
    state: () => 'signed-out',
    subscribe: () => () => undefined,
    login: async () => 'signed-in',
    logout: async () => 'signed-out',
  }
  tenant: string | undefined = undefined
  readonly scope: ScopeSource = {
    get: () => this.tenant,
    set: () => undefined,
    subscribe: () => () => undefined,
  }

  navigate(pageId: string): void {
    this.navigated.push(pageId)
  }

  attached(anchor: string, subject: string): ReactNode {
    return this.items('attached')
      .filter(item => item.anchor === anchor)
      .map(item => item.render({ scope: this.scope.get(), subject }))
  }

  arranged(anchor: string, subject: string, layout: AttachedLayout): ReactNode {
    return <Arranged shell={this} anchor={anchor} subject={subject} layout={layout} />
  }
}

function Arranged({
  shell,
  anchor,
  subject,
  layout,
}: {
  readonly shell: ReferenceShell
  readonly anchor: string
  readonly subject: string
  readonly layout: AttachedLayout
}): ReactNode {
  const [items, setItems] = useState(() => shell.items('attached'))
  useEffect(() => {
    setItems(shell.items('attached'))
    return shell.subscribe('attached', () => setItems(shell.items('attached')))
  }, [shell])
  return layout(
    items
      .filter(item => item.anchor === anchor)
      .map(item => ({
        id: item.id,
        label: item.label,
        node: item.render({ scope: shell.scope.get(), subject }),
      })),
  )
}

export const startShell = (): Promise<Started<ReferenceShell>> => startShellOf(ReferenceShell)

export const render = (): null => null
