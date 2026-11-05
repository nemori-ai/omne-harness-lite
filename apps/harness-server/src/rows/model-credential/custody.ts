// The model credential binding of the acting tenant over the local custody (public contract
// 「模型凭据」). Every call is admitted first (`../authorization/model-credential-access.ts`); then
// it reads or writes the one binding this host keys by the tenant (`src/model/tenant-credential.ts`).
// The results carry presence, owner and time. The secret goes in through `bind` and comes out of
// nothing here.
import type { LocalCredentialCustody } from '@omne-harness/model-host-local/cordis'
import { MODEL_SEND, type CredentialReference } from '@omne-harness/model-contract/provider'
import type {
  ModelCredentialAccess,
  ModelCredentialCustody,
  ModelCredentialDescribeOutcome,
} from '@omne-harness/server-entry'
import { parseInstant } from '@omne-harness/utc-instant'
import type { SystemInstant } from '../../entry/session-clock.ts'
import { tenantCredentialId } from '../../model/tenant-credential.ts'
import type {
  ModelCredentialAction,
  ModelCredentialVerdict,
} from '../authorization/model-credential-access.ts'

export type TenantCredentialCustodyInput = Readonly<{
  /** The binding management of the live credential plugin. */
  custody: LocalCredentialCustody
  /** The admission of one action for one access. */
  qualify(
    input: Readonly<{
      principal: unknown
      tenant: ModelCredentialAccess['tenant']
      action: ModelCredentialAction
    }>,
  ): Promise<ModelCredentialVerdict>
  /** The host time of a bind, as checked instant text. */
  now(): SystemInstant
}>

type Admitted =
  | Readonly<{ kind: 'reference'; reference: CredentialReference }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'basis-unavailable' }>

export function createTenantCredentialCustody(
  input: TenantCredentialCustodyInput,
): ModelCredentialCustody {
  const admit = async (
    access: ModelCredentialAccess,
    action: ModelCredentialAction,
  ): Promise<Admitted> => {
    const verdict = await input.qualify({
      principal: access.principal,
      tenant: access.tenant,
      action,
    })
    if (verdict.kind === 'denied') return { kind: 'denied' }
    if (verdict.kind === 'unavailable') return { kind: 'basis-unavailable' }
    const id = tenantCredentialId(access.tenant)
    if (id === undefined) return { kind: 'denied' }
    return { kind: 'reference', reference: { id, tenant: access.tenant, purpose: MODEL_SEND } }
  }

  const custody: ModelCredentialCustody = {
    async bind({ access, secret }) {
      const admitted = await admit(access, 'bind')
      if (admitted.kind !== 'reference') return admitted
      const reading = input.now()
      const configuredAt = reading.ok ? parseInstant(reading.text) : undefined
      if (!reading.ok || configuredAt === undefined || !configuredAt.ok)
        return { kind: 'basis-unavailable' }
      const written = input.custody.bind({
        reference: admitted.reference,
        secret,
        configuredAt: reading.text,
      })
      switch (written.kind) {
        case 'written':
          return { kind: 'succeeded', configuredAt: configuredAt.value }
        case 'not-written':
          return { kind: 'basis-unavailable' }
        case 'unconfirmed':
          return { kind: 'unknown' }
        case 'denied':
          return { kind: 'denied' }
        default: {
          const _exhaustive: never = written
          return _exhaustive
        }
      }
    },

    async unbind({ access }) {
      const admitted = await admit(access, 'unbind')
      if (admitted.kind !== 'reference') return admitted
      const removed = input.custody.unbind({ reference: admitted.reference })
      switch (removed.kind) {
        case 'written':
          return { kind: 'succeeded' }
        case 'absent':
          return { kind: 'no-change' }
        case 'not-written':
          return { kind: 'basis-unavailable' }
        case 'unconfirmed':
          return { kind: 'unknown' }
        case 'denied':
          return { kind: 'denied' }
        default: {
          const _exhaustive: never = removed
          return _exhaustive
        }
      }
    },

    async describe({ access }): Promise<ModelCredentialDescribeOutcome> {
      const admitted = await admit(access, 'describe')
      if (admitted.kind !== 'reference') return admitted
      const view = input.custody.describe({ reference: admitted.reference })
      switch (view.kind) {
        case 'unbound':
          return { kind: 'succeeded', credential: { state: 'unbound' } }
        case 'bound': {
          // `revoked` comes from no public operation; like `unreadable`, a send cannot use it.
          const state = view.life === 'active' ? 'usable' : 'unreadable'
          if (view.configuredAt === undefined)
            return { kind: 'succeeded', credential: { state, tenantId: access.tenant } }
          const configuredAt = parseInstant(view.configuredAt)
          // A stored time that does not parse is a store fault: no time is made up.
          if (!configuredAt.ok) return { kind: 'basis-unavailable' }
          return {
            kind: 'succeeded',
            credential: { state, tenantId: access.tenant, configuredAt: configuredAt.value },
          }
        }
        case 'denied':
          return { kind: 'denied' }
        case 'unavailable':
          return { kind: 'basis-unavailable' }
        default: {
          const _exhaustive: never = view
          return _exhaustive
        }
      }
    },
  }
  return Object.freeze(custody)
}
