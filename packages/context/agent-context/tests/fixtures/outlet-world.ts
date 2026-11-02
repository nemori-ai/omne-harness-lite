// The shared world of the outlet tests: two tenants, one target per tenant, and a real account
// projection (createContextAccounting) that the test rebuilds from an empty replay. Only the
// account projection is real. The outlet under test is built by the caller.
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import { createContextAccounting } from '@omne-harness/request-context'
import {
  decodeRecoveryGrantRef,
  type AdoptedRequestFact,
  type AccountReceipt,
  type Access,
  type ContextAccountingInbox,
  type ContextAccountingInput,
  type ContextTarget,
  type SystemRecoveryAccess,
} from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  createMemoryAdoptedSource,
  createMemoryReadEligibility,
} from '@omne-harness/request-context-contract/testing'

export function mintTenant(organization: string, account: string): TenantId {
  const org = organizationCodec.parse(`org_${organization.repeat(26)}`)
  const acc = accountCodec.parse(`acc_${account.repeat(26)}`)
  if (!org.ok || !acc.ok) throw new Error('the fixture identity text is invalid')
  return tenant(org.value, acc.value)
}

export const access: Access<string> = { principal: 'ada', tenant: mintTenant('0', '1') }
export const otherAccess: Access<string> = { principal: 'bob', tenant: mintTenant('2', '3') }
export const sender = { owner: 'agent-context', name: 'outlet', revision: '1', digest: 'd' }

const scope = createAssemblyFixture().target.scope
/** The one target of a tenant. */
export function targetOf(who: TenantId): ContextTarget {
  return { tenant: who, scope: { ...scope, ref: 'scope:outlet' } as never }
}

const evidence = { owner: 'test', record: 'snapshot', revision: '1', digest: 'd' }
const grant = decodeRecoveryGrantRef('grant_1')
if ('failure' in grant) throw new Error('the fixture grant is invalid')
const system: SystemRecoveryAccess<string> = {
  scope: 'system',
  principal: 'host',
  grant: grant.ok,
}

/** What the real projection reported for the facts that the spy saw. */
export type SpiedInbox = ContextAccountingInbox<string> &
  Readonly<{
    adopted: ReturnType<typeof createMemoryAdoptedSource<string>>
    /** The facts that reached `receive`, in order, with the receipt of each. */
    seen(): readonly Readonly<{ input: ContextAccountingInput; receipt: AccountReceipt }>[]
    /** The revision of the dispatch that the projection made current, or null. */
    current(call: string, dispatch: string): string | null
  }>

/**
 * A real account projection whose targets are rebuilt from an empty replay, wrapped so that the
 * test sees each fact and its receipt. `current` follows only what the projection reports: a
 * fact it answers `inserted` is the current revision of its dispatch.
 */
export async function realInbox(
  targets: readonly ContextTarget[],
  limits = { maxTargets: 4, maxFactsPerTarget: 16, maxRevisionsPerDispatch: 8 },
): Promise<SpiedInbox> {
  const adopted = createMemoryAdoptedSource<string>()
  const accounting = createContextAccounting<string>({
    sourceAuthority: { check: async () => ({ kind: 'allowed' }) },
    readEligibility: createMemoryReadEligibility<string>(),
    adoptedSource: adopted,
    recoveryAuthority: {
      check: async () => ({ kind: 'allowed' }),
      checkFact: async () => ({ kind: 'allowed' }),
    },
    limits,
  })
  for (const target of targets) {
    const rebuilt = await accounting.recovery.rebuildAccounts({
      access: system,
      target,
      replay: { snapshot: evidence, facts: (async function* (): AsyncGenerator<never> {})() },
    })
    if (rebuilt.kind !== 'rebuilt') throw new Error('the fixture target should rebuild')
  }
  const seen: { input: ContextAccountingInput; receipt: AccountReceipt }[] = []
  const heads = new Map<string, string>()
  return {
    adopted,
    seen: () => seen,
    current: (call, dispatch) => heads.get(`${call}\u0000${dispatch}`) ?? null,
    usage: input => accounting.inbox.usage(input),
    async receive(input) {
      const receipt = await accounting.inbox.receive(input)
      seen.push({ input: input.input, receipt })
      if (receipt.kind === 'received' && receipt.change === 'inserted')
        heads.set(
          `${input.input.call.call}\u0000${input.input.dispatch}`,
          input.input.account.revision,
        )
      return receipt
    },
  }
}

export type { AdoptedRequestFact }
