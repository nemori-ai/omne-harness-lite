import { capabilityId, type CapabilityId, type ManagedAsset } from '@omne-harness/assets'
import type { HeldSetting, HeldSettings, SettingWritten } from '@omne-harness/assets-tools'
import type { TenantId } from '@omne-harness/legal-identity'
import type { WriteOutcome } from '@omne-harness/settings'
import type { ActingSettings, ActingSettingView } from '../governance/acting-settings.ts'
import type { SecretSettings } from '../settings/ports.ts'

type Asset = Readonly<{ category: string; name: string }>
type Configured = Extract<HeldSetting, { kind: 'secret' }>['configured']

export type HeldSettingsInput = Readonly<{
  acting: ActingSettings
  principal: unknown
  tenant: TenantId
  /** The asset as the tenant holds it now, as the management face answers this caller. */
  describe(capability: CapabilityId): Promise<ManagedAsset>
  /** The face that knows whether a secret is set; absent, that is not known. */
  secrets(): Pick<SecretSettings, 'describe'> | undefined
}>

const SET: Readonly<Record<string, Configured>> = { available: 'yes', unset: 'no', revoked: 'no' }

const WRITTEN: Readonly<Record<Exclude<WriteOutcome['kind'], 'not-writable'>, SettingWritten>> = {
  written: 'written',
  'no-change': 'no-change',
  denied: 'denied',
  'not-visible': 'gone',
  invalid: 'invalid',
  conflict: 'conflict',
  unavailable: 'unavailable',
  unknown: 'unknown',
}

function ordinary(view: Extract<ActingSettingView, { kind: 'ordinary' }>): HeldSetting {
  const { editable, effective } = view
  return {
    kind: 'ordinary',
    item: view.item,
    title: view.declaration.title,
    revision: view.revision,
    schema: view.valueSchema,
    own: view.own,
    effective: effective.value,
    source: effective.source,
    writable: editable.kind === 'yes' ? 'yes' : editable.reason,
  }
}

/** The settings port of OmneExtensions over the row face: for the tenant and the principal of one call. */
export function heldSettingsOf(input: HeldSettingsInput): HeldSettings {
  const { acting, principal, tenant } = input

  async function held(asset: Asset): Promise<'held' | 'not-held' | 'denied' | 'unavailable'> {
    const capability = capabilityId(asset.category, asset.name)
    if (!capability.ok) return 'not-held'
    const described = await input.describe(capability.id).catch(() => undefined)
    if (described?.kind === 'asset') return 'held'
    if (described?.kind === 'absent' || described?.kind === 'denied')
      return described.kind === 'absent' ? 'not-held' : 'denied'
    return 'unavailable'
  }

  async function configured(asset: Asset, item: string): Promise<Configured> {
    try {
      const asked = { principal, tenant, asset, item } as Parameters<SecretSettings['describe']>[0]
      const read = await input.secrets()?.describe(asked)
      const own = read?.kind === 'described' && read.item.kind === 'secret' ? read.item.own : ''
      return SET[own] ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  async function rowOf(asset: Asset, view: ActingSettingView): Promise<HeldSetting> {
    if (view.kind === 'ordinary') return ordinary(view)
    const head = { item: view.item, title: view.declaration.title, revision: view.revision }
    return view.kind === 'permission'
      ? { ...head, kind: 'permission' }
      : { ...head, kind: 'secret', configured: await configured(asset, view.item) }
  }

  return Object.freeze({
    async list(asset) {
      const standing = await held(asset)
      if (standing !== 'held') return standing
      const read = await acting.list({ principal, tenant, asset })
      if (read === 'not-visible') return []
      if (read === 'denied' || read === 'unavailable') return read
      return Promise.all(read.map(view => rowOf(asset, view)))
    },
    async write({ asset, item, operation, revision, change }) {
      const written = await acting.write({
        principal,
        tenant,
        asset,
        item,
        operation,
        expectedRevision: revision,
        change,
      })
      return written.kind === 'not-writable' ? written.reason : WRITTEN[written.kind]
    },
  })
}
