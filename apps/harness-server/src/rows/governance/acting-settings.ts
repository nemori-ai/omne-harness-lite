import {
  noArguments,
  referenceAdmissionCheck,
  type AdmissionInput,
} from '@omne-harness/authorization'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  SettingJson,
  SettingView,
  TenantSettings,
  TenantSettingsAction,
  TenantSettingsAssetRef,
  WriteOutcome,
} from '@omne-harness/settings'
import { classify } from '../authorization/principals.ts'

type Face = TenantSettings<unknown>
type Asked = Readonly<{ principal: unknown; tenant: TenantId; action: TenantSettingsAction }>
type Verdict = 'allowed' | 'denied' | 'unavailable'

function admissionOf({ principal, tenant, action }: Asked): AdmissionInput | undefined {
  const who = classify(principal)
  const tenantText = tenantCodec.encode(tenant)
  if (who === null || who.column === 'system' || !tenantText.ok) return undefined
  if (!tenantEquals(who.principal.tenant, tenant)) return undefined
  return {
    access: { principal: who.principal, tenant },
    operation: { owner: 'settings', name: `setting-${action}` },
    target: { owner: 'settings', kind: 'tenant-scope', key: tenantText.value },
    arguments: noArguments(),
    requires: [],
    permit: null,
  }
}

/** Whoever may act for the tenant: its login, or the work of one of its sessions. Asked at every call. */
export function actingAdmit(
  identity: Readonly<{ verifier: PrincipalVerifier; standing: TenantStandingSource }>,
  active: () => boolean,
): (input: Asked) => Promise<Verdict> {
  const admission = referenceAdmissionCheck({ ...identity, permits: null })
  return async input => {
    if (!active()) return 'unavailable'
    const request = admissionOf(input)
    if (request === undefined) return 'denied'
    try {
      const answer = await admission.check(request)
      if (answer.kind === 'allowed') return 'allowed'
      return answer.kind === 'denied' ? 'denied' : 'unavailable'
    } catch {
      return 'unavailable'
    }
  }
}

type Head = Pick<SettingView, 'owner' | 'item' | 'revision' | 'declaration'>
/** A setting as a row reads it: an ordinary item whole, a secret or a permission by name only. */
export type ActingSettingView =
  | Extract<SettingView, { kind: 'ordinary' }>
  | (Head & Readonly<{ kind: 'secret' | 'permission' }>)

type Target = Readonly<{ principal: unknown; tenant: TenantId; asset: TenantSettingsAssetRef }>
type Change = Readonly<{ kind: 'set'; value: unknown }> | Readonly<{ kind: 'clear' }>

export type ActingSettings = Readonly<{
  list(
    input: Target,
  ): Promise<readonly ActingSettingView[] | 'denied' | 'not-visible' | 'unavailable'>
  /** Writes or clears one ordinary item; an item of any other kind is not written. */
  write(
    input: Target &
      Readonly<{ item: string; operation: string; expectedRevision: string; change: Change }>,
  ): Promise<WriteOutcome>
}>

const PAGE = 100
const NOT_ORDINARY: WriteOutcome = { kind: 'not-writable', reason: 'not-a-source' }

function narrowed(view: SettingView): ActingSettingView {
  if (view.kind === 'ordinary') return view
  const { owner, item, revision, declaration, kind } = view
  return { owner, item, revision, declaration, kind }
}

export function createActingSettings(face: Face): ActingSettings {
  async function listed(input: Target) {
    const found: ActingSettingView[] = []
    let after: string | null = null
    do {
      const { principal, tenant, asset } = input
      const scope = { kind: 'asset', asset } as const
      const page = await face.list({ principal, tenant, scope, after, limit: PAGE })
      if (page.kind === 'denied' || page.kind === 'not-visible') return page.kind
      if (page.kind !== 'listed' || page.completeness !== 'complete') return 'unavailable'
      found.push(...page.items.map(narrowed))
      after = page.next
    } while (after !== null)
    return found
  }
  return Object.freeze({
    list: input => listed(input).catch(() => 'unavailable' as const),
    async write({ principal, tenant, asset, item, operation, expectedRevision, change }) {
      const at = { principal, tenant, owner: { kind: 'asset', ...asset }, item } as const
      const read = await face.describe(at).catch(() => ({ kind: 'unavailable' }) as const)
      if (read.kind !== 'described') return read.kind === 'conflict' ? { kind: 'conflict' } : read
      if (read.item.kind !== 'ordinary') return NOT_ORDINARY
      const write = { ...at, operation, expectedRevision }
      const value = {
        kind: 'ordinary',
        value: change.kind === 'set' ? change.value : null,
      } as const
      const written =
        change.kind === 'clear'
          ? face.clear(write)
          : face.set({ ...write, value: { ...value, value: value.value as SettingJson } })
      return written.catch(() => ({ kind: 'unknown' }) as const)
    },
  })
}
