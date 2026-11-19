import type { AssetRowView, AssetsProtocol, CreationDetail } from '@omne-harness/assets-protocol'
import type { JsonValue } from '@omne-harness/json-text'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { AssetsDriver, type LocalFile } from './assets-driver.ts'
import { listShown, type Action, type AssetsState, type Detail } from './assets-machine.ts'
import { NOT_CREATING, type Creating } from './creation.ts'
import { holdingsOf, type Holding } from './holdings.ts'
import { SettingsDriver } from './settings-driver.ts'
import type { Notice, Row, State } from './settings-machine.ts'
import { createTenantChanges, type TenantChanges } from './tenant-changes.ts'

/** One listed asset with its own settings, its detail when opened, and its action slot. */
export type AssetEntry = Readonly<{
  row: AssetRowView
  settings: readonly Row[]
  detail: Detail | null
  action: Action
}>

export type CategoryAssets =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'unreadable'; notice: Notice }>
  | Readonly<{ kind: 'read'; entries: readonly AssetEntry[]; partial: boolean }>

export type CategorySnapshot =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'unreadable'; notice: Notice }>
  | Readonly<{
      kind: 'read'
      holdings: readonly Holding[]
      partial: boolean
      assets: CategoryAssets
      /** How this category creates an asset, and its hint; null until the category is described. */
      creation: CreationDetail | null
      hint: string | null
      creating: Creating
    }>

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
  openAsset: (name: string) => void
  closeAsset: (name: string) => void
  setEnabled: (name: string, enabled: boolean) => void
  remove: (name: string) => void
  confirmAsset: (name: string) => void
  createFromData: (name: string, body: JsonValue) => void
  /** Sends the files in parts; the bytes received so far come from the server's answers. */
  createFromDirectory: (name: string, files: readonly LocalFile[]) => void
  confirmCreate: () => void
}>

export type GovernanceModel = Readonly<{
  open: (tenant: TenantId, category: string) => CategoryGovernance
  openAll: (tenant: TenantId) => CategoryGovernance
}>

export type GovernanceDeps = Readonly<{
  client: ClientOf<AssetsProtocol>
  newId?: () => string
  changes?: TenantChanges
}>

const READING: CategorySnapshot = { kind: 'reading' }
const NO_ACTION: Action = { kind: 'none' }
const NOT_BY_CATEGORY: CategoryAssets = {
  kind: 'unreadable',
  notice: { kind: 'refused', text: '这个视图不分类别，不列资产。' },
}

const READING_ASSETS: CategoryAssets = { kind: 'reading' }

/** The listed assets joined with their settings; a setting whose asset is not listed is not shown. */
function listedAssets(assets: AssetsState, holdings: readonly Holding[]): CategoryAssets {
  const list = assets.list
  if (list.kind === 'failed') return { kind: 'unreadable', notice: list.notice }
  const listed = listShown(list)
  if (listed === null) return READING_ASSETS
  const settingsOf = new Map(holdings.map(holding => [holding.name, holding.rows]))
  const entries = listed.items.map(row => ({
    row,
    settings: settingsOf.get(row.name) ?? [],
    detail: assets.details.get(row.name) ?? null,
    action: assets.actions.get(row.name) ?? NO_ACTION,
  }))
  return { kind: 'read', entries, partial: listed.partial }
}

export function snapshotOf(
  state: State,
  category: string | null,
  assets?: AssetsState,
): CategorySnapshot {
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
      const holdings = holdingsOf(rows)
      return { kind: 'read', holdings, partial: list.partial, ...categoryParts(assets, holdings) }
    }
  }
}

function categoryParts(assets: AssetsState | undefined, holdings: readonly Holding[]) {
  if (assets === undefined)
    return { assets: NOT_BY_CATEGORY, creation: null, hint: null, creating: NOT_CREATING }
  const info = assets.category.kind === 'read' ? assets.category : null
  return {
    assets: listedAssets(assets, holdings),
    creation: info?.creation ?? null,
    hint: info?.hint ?? null,
    creating: assets.creating,
  }
}

type Shared<D> = { readonly driver: D; users: number; readonly release: () => void }

/** Drivers shared by key, each started once and disposed with its last user. */
function sharing<D extends { dispose(): void }>() {
  const shared = new Map<string, Shared<D>>()
  return {
    take(key: string, make: () => Shared<D>): Shared<D> {
      const entry = shared.get(key) ?? make()
      shared.set(key, entry)
      entry.users += 1
      return entry
    },
    give(key: string, entry: Shared<D>): void {
      entry.users -= 1
      if (entry.users > 0) return
      entry.release()
      entry.driver.dispose()
      shared.delete(key)
    },
  }
}

const nothing = (): void => undefined

export const NO_ASSET_ACTIONS = Object.freeze({
  openAsset: nothing,
  closeAsset: nothing,
  setEnabled: nothing,
  remove: nothing,
  confirmAsset: nothing,
  createFromData: nothing,
  createFromDirectory: nothing,
  confirmCreate: nothing,
})

function assetActions(driver: AssetsDriver) {
  return {
    openAsset: (name: string) => driver.dispatch({ kind: 'open', name }),
    closeAsset: (name: string) => driver.dispatch({ kind: 'close', name }),
    setEnabled: (name: string, enabled: boolean) =>
      driver.change(name, { kind: enabled ? 'enable' : 'disable' }),
    remove: (name: string) => driver.change(name, { kind: 'remove' }),
    confirmAsset: (name: string) => driver.dispatch({ kind: 'confirm', name }),
    createFromData: (name: string, body: JsonValue) => driver.create({ kind: 'data', name, body }),
    createFromDirectory: (name: string, files: readonly LocalFile[]) =>
      driver.create(
        {
          kind: 'directory',
          name,
          manifest: files.map(file => ({ path: file.path, bytes: file.bytes.length })),
        },
        files,
      ),
    confirmCreate: () => driver.dispatch({ kind: 'confirm-create' }),
  }
}

/** Reads again only what could not be read: the settings list, the asset list, the category. */
function retry(settings: SettingsDriver, assets: AssetsDriver | undefined): void {
  settings.readList()
  const state = assets?.getState()
  if (state?.list.kind === 'failed') assets?.dispatch({ kind: 'read-list' })
  if (state?.category.kind === 'failed') assets?.dispatch({ kind: 'read-category' })
}

export function createGovernance(deps: GovernanceDeps): GovernanceModel {
  const changes = deps.changes ?? createTenantChanges({ client: deps.client })
  const ids = deps.newId === undefined ? {} : { newId: deps.newId }

  const settingsPool = sharing<SettingsDriver>()
  const assetsPool = sharing<AssetsDriver>()

  function settingsOf(tenant: TenantId): Shared<SettingsDriver> {
    const scope = { kind: 'asset' } as const
    const driver = new SettingsDriver({ client: deps.client, tenant, scope, ...ids })
    driver.readList()
    return { driver, users: 0, release: changes.subscribe(tenant, () => driver.refresh()) }
  }

  function assetsOf(tenant: TenantId, category: string): Shared<AssetsDriver> {
    const driver = new AssetsDriver({ client: deps.client, tenant, category, ...ids })
    driver.start()
    const release = changes.subscribe(tenant, () => driver.dispatch({ kind: 'changed' }))
    return { driver, users: 0, release }
  }

  function view(tenant: TenantId, category: string | null): CategoryGovernance {
    const tenantKey = encodeTenantText(tenant)
    const settings = settingsPool.take(tenantKey, () => settingsOf(tenant))
    const assetsKey = JSON.stringify([tenantKey, category])
    const assets =
      category === null ? undefined : assetsPool.take(assetsKey, () => assetsOf(tenant, category))
    const driver = settings.driver
    let seen: [State, AssetsState | undefined] | undefined
    let snapshot = READING
    return {
      subscribe(listener) {
        const fromSettings = driver.subscribe(listener)
        const fromAssets = assets?.driver.subscribe(listener)
        return () => {
          fromSettings()
          fromAssets?.()
        }
      },
      getSnapshot() {
        const state = driver.getState()
        const assetsState = assets?.driver.getState()
        if (seen?.[0] !== state || seen[1] !== assetsState) {
          seen = [state, assetsState]
          snapshot = snapshotOf(state, category, assetsState)
        }
        return snapshot
      },
      read: () => retry(driver, assets?.driver),
      set: (key, pick) => driver.set(key, pick),
      setValue: (key, value) => driver.setValue(key, value),
      setSecret: (key, secret) => driver.setSecret(key, secret),
      clear: key => driver.clear(key),
      confirm: key => driver.confirm(key),
      retryRow: key => driver.retryRow(key),
      close() {
        if (assets !== undefined) assetsPool.give(assetsKey, assets)
        settingsPool.give(tenantKey, settings)
      },
      ...(assets === undefined ? NO_ASSET_ACTIONS : assetActions(assets.driver)),
    }
  }

  return {
    open: (tenant, category) => view(tenant, category),
    openAll: tenant => view(tenant, null),
  }
}
