import type { PointSink } from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import type { ReactNode } from 'react'
import type { Layouts, Position } from './model/layout.ts'
import { contributePresentations } from './view/presentations.tsx'
import { Panel, useRefreshEvery, type LayoutStore } from './view/panel.tsx'
import type { UsageReads } from './view/reads.ts'
import { contributeWidgets, MODULE_LAYOUTS } from './view/widgets.tsx'

export const USAGE_PAGE = 'usage'
export const USAGE_PAGE_ORDER = 30
export const USAGE_IN_SESSION = 'usage'
export const USAGE_STATUS = 'usage.occupancy'

type SessionSink = PointSink<{ readonly session: string }>

export type UsageUiOptions = Readonly<{
  sessionSide?: SessionSink
  sessionStatus?: SessionSink
  layouts?: Layouts
  store?: LayoutStore
  refreshMs?: number
  zone?: () => string
}>

export function memoryLayoutStore(initial: Layouts = {}): LayoutStore {
  let stored = initial
  return {
    read: () => stored,
    write: layouts => {
      stored = layouts
    },
  }
}

function Live({
  shell,
  reads,
  tenant,
  position,
  session,
  options,
  store,
}: {
  readonly shell: ShellService
  readonly reads: UsageReads
  readonly tenant: string
  readonly position: Position
  readonly session: string | null
  readonly options: UsageUiOptions
  readonly store: LayoutStore
}): ReactNode {
  useRefreshEvery(reads, options.refreshMs)
  return (
    <Panel
      shell={shell}
      reads={reads}
      tenant={tenant}
      position={position}
      session={session}
      sources={{ module: MODULE_LAYOUTS, assembly: options.layouts, store }}
    />
  )
}

export function contributeUsage(
  shell: ShellService,
  reads: UsageReads,
  options: UsageUiOptions,
): void {
  const store = options.store ?? memoryLayoutStore()
  const live = (tenant: string, position: Position, session: string | null) => (
    <Live
      shell={shell}
      reads={reads}
      tenant={tenant}
      position={position}
      session={session}
      options={options}
      store={store}
    />
  )
  contributePresentations(shell)
  contributeWidgets(shell)
  shell.contribute('pages', {
    id: USAGE_PAGE,
    title: '用量',
    order: USAGE_PAGE_ORDER,
    icon: 'overview',
    render: ({ scope }) =>
      scope === undefined ? null : (
        <div className="usage-page">
          <h2 className="usage-page-title">用量</h2>
          {live(scope, 'tenant', null)}
        </div>
      ),
  })
  options.sessionSide?.contribute(shell, {
    id: USAGE_IN_SESSION,
    order: 20,
    label: '用量',
    render: ({ scope, subject }) =>
      scope === undefined ? null : live(scope, 'session', subject.session),
  })
  options.sessionStatus?.contribute(shell, {
    id: USAGE_STATUS,
    order: 0,
    render: ({ scope, subject }) =>
      scope === undefined ? null : live(scope, 'status', subject.session),
  })
}
