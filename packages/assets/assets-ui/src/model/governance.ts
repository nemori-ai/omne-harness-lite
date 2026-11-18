import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import type { JsonValue } from '@omne-harness/json-text'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { holdingsOf, type Holding } from './holdings.ts'
import { SettingsDriver } from './settings-driver.ts'
import type { Notice, State } from './settings-machine.ts'

export type CategorySnapshot =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'unreadable'; notice: Notice }>
  | Readonly<{ kind: 'read'; holdings: readonly Holding[]; partial: boolean }>

export type CategoryGovernance = Readonly<{
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => CategorySnapshot
  read: () => void
  set: (key: string, pick: string) => void
  setValue: (key: string, value: JsonValue) => void
  setSecret: (key: string, secret: string) => void
  clear: (key: string) => void
  confirm: (key: string) => void
  retryRow: (key: string) => void
  close: () => void
}>

export type GovernanceModel = Readonly<{
  open: (tenant: TenantId, category: string) => CategoryGovernance
  openAll: (tenant: TenantId) => CategoryGovernance
}>

export type GovernanceDeps = Readonly<{
  client: ClientOf<AssetsProtocol>
  newId?: () => string
}>

const READING: CategorySnapshot = { kind: 'reading' }

export function snapshotOf(state: State, category: string | null): CategorySnapshot {
  const list = state.list
  switch (list.kind) {
    case 'unread':
    case 'reading':
      return READING
    case 'failed':
      return { kind: 'unreadable', notice: list.notice }
    case 'read': {
      const rows =
        category === null
          ? list.rows
          : list.rows.filter(
              row => row.view.owner.kind === 'asset' && row.view.owner.category === category,
            )
      return { kind: 'read', holdings: holdingsOf(rows), partial: list.partial }
    }
  }
}

type Shared = { readonly driver: SettingsDriver; users: number }

export function createGovernance(deps: GovernanceDeps): GovernanceModel {
  const shared = new Map<string, Shared>()

  function share(tenant: TenantId, key: string): Shared {
    const known = shared.get(key)
    if (known !== undefined) return known
    const driver = new SettingsDriver({
      client: deps.client,
      tenant,
      scope: { kind: 'asset' },
      ...(deps.newId === undefined ? {} : { newId: deps.newId }),
    })
    const created: Shared = { driver, users: 0 }
    shared.set(key, created)
    driver.readList()
    return created
  }

  function view(tenant: TenantId, category: string | null): CategoryGovernance {
    const key = encodeTenantText(tenant)
    const entry = share(tenant, key)
    entry.users += 1
    const { driver } = entry
    let seen: State | undefined
    let snapshot = READING
    return {
      subscribe: driver.subscribe,
      getSnapshot() {
        const state = driver.getState()
        if (state !== seen) {
          seen = state
          snapshot = snapshotOf(state, category)
        }
        return snapshot
      },
      read: () => driver.readList(),
      set: (key, pick) => driver.set(key, pick),
      setValue: (key, value) => driver.setValue(key, value),
      setSecret: (key, secret) => driver.setSecret(key, secret),
      clear: key => driver.clear(key),
      confirm: key => driver.confirm(key),
      retryRow: key => driver.retryRow(key),
      close() {
        entry.users -= 1
        if (entry.users > 0) return
        driver.dispose()
        shared.delete(key)
      },
    }
  }

  return {
    open: (tenant, category) => view(tenant, category),
    openAll: tenant => view(tenant, null),
  }
}
