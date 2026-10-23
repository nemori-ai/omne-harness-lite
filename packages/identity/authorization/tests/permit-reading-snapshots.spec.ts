import { describe, expect, it } from 'vitest'
import {
  decodePermitId,
  digestOf,
  inMemoryPermitLedger,
  noArguments,
  referenceAdmissionCheck,
  type AdmissionDecision,
  type PermitGrant,
  type PermitLookup,
  type PermitState,
} from '@omne-harness/authorization'
import {
  DEFAULT_ROLES,
  READ_HISTORY,
  SESSION_TARGET,
  adminTenant,
  issued,
  memberTenant,
  readHistoryInput,
  standingTable,
} from './support.ts'

function mutableGrant(grant: PermitGrant) {
  return {
    ref: { ...grant.ref },
    operation: { ...grant.operation },
    target: { ...grant.target },
    arguments: { ...grant.arguments },
    granted: { ...grant.granted },
  }
}

function otherPermit() {
  const result = decodePermitId('another-permit')
  if ('failure' in result) throw new Error('fixture permit did not decode')
  return result.ok
}

async function fixture(consumed = false) {
  const principals = issued()
  const tenant = adminTenant()
  const standing = standingTable()
  standing.join(tenant, DEFAULT_ROLES.member)
  const permits = inMemoryPermitLedger()
  const granted = await permits.grantor.grant({
    tenant,
    operation: READ_HISTORY,
    target: SESSION_TARGET,
    arguments: noArguments(),
    granted: { owner: 'hitl', record: 'card_1', revision: '1', digest: 'approval' },
  })
  if (granted.kind !== 'granted') throw new Error('fixture permit was not granted')
  const input = readHistoryInput(principals.actingForAdmin, tenant, { permit: granted.grant.ref })
  if (consumed)
    await permits.ledger.consume({
      permit: granted.grant.ref,
      consumer: { owner: 'tool', work: 'work_1', position: '0' },
    })
  const read = await permits.ledger.lookup({ permit: granted.grant.ref })
  if (read.kind !== 'found') throw new Error('fixture permit was not found')
  const answer = { ...read, grant: mutableGrant(read.grant) }

  async function checkAfterRead(answer: PermitLookup, mutate: () => void) {
    const entered = Promise.withResolvers<void>()
    const released = Promise.withResolvers<PermitLookup>()
    const check = referenceAdmissionCheck({
      verifier: principals.authority.verifier,
      standing: standing.source,
      permits: {
        lookup() {
          entered.resolve()
          return released.promise
        },
        consume: request => permits.ledger.consume(request),
      },
    })
    const pending = check.check(input)
    await entered.promise
    released.resolve(answer)
    // The lookup continuation runs first, then this provider reuse, then the check continuation.
    const reused = Promise.withResolvers<void>()
    queueMicrotask(() => {
      try {
        mutate()
        reused.resolve()
      } catch (error) {
        reused.reject(error)
      }
    })
    const [decision] = await Promise.all([pending, reused.promise])
    return decision
  }

  return { answer, input, permits, read, checkAfterRead }
}

function expectRecomputable(decision: AdmissionDecision) {
  if (decision.kind === 'unavailable') throw new Error('expected a decision with evidence')
  const content =
    decision.kind === 'denied'
      ? { kind: decision.kind, reason: decision.reason, basis: decision.basis }
      : { kind: decision.kind, basis: decision.basis }
  expect(decision.evidence.digest).toBe(digestOf(content))
}

it('denies a consumed permit when the provider reuses its answer as open', async () => {
  const { answer, input, permits, checkAfterRead } = await fixture(true)
  const decision = await checkAfterRead(answer, () => {
    answer.state = { kind: 'open' }
  })
  expect(answer.state.kind).toBe('open')
  expect(Object.isFrozen(answer)).toBe(false)
  expect(decision).toMatchObject({ kind: 'denied', reason: 'permit-consumed' })
  expectRecomputable(decision)
  expect(await permits.ledger.lookup({ permit: answer.grant.ref })).toMatchObject({
    kind: 'found',
    state: { kind: 'consumed' },
  })
  expect(
    await permits.ledger.consume({
      permit: answer.grant.ref,
      consumer: { owner: 'tool', work: 'work_2', position: '0' },
    }),
  ).toMatchObject({ kind: 'already-consumed' })
  if (decision.kind !== 'denied') throw new Error('expected denial')
  expect(decision.basis.tenant).toBe(input.access.tenant)
  expect(decision.basis.permit?.tenant).toBe(input.permit?.tenant)
})

it('denies a consumed permit when the provider mutates the state wrapper itself', async () => {
  const { answer, read, checkAfterRead } = await fixture(true)
  if (read.state.kind !== 'consumed') throw new Error('expected consumed fixture')
  const state: { kind: PermitState['kind']; fact: typeof read.state.fact } = {
    kind: 'consumed',
    fact: read.state.fact,
  }
  answer.state = state
  const decision = await checkAfterRead(answer, () => {
    state.kind = 'open'
  })
  expect(state.kind).toBe('open')
  expect(Object.isFrozen(state)).toBe(false)
  expect(decision).toMatchObject({ kind: 'denied', reason: 'permit-consumed' })
})

type MutableGrant = ReturnType<typeof mutableGrant>
const bindings: ReadonlyArray<readonly [string, (grant: MutableGrant) => void]> = [
  [
    'permit text',
    grant => {
      grant.ref.permit = otherPermit()
    },
  ],
  [
    'operation owner',
    grant => {
      grant.operation.owner = 'other'
    },
  ],
  [
    'operation name',
    grant => {
      grant.operation.name = 'other'
    },
  ],
  [
    'target owner',
    grant => {
      grant.target.owner = 'other'
    },
  ],
  [
    'target kind',
    grant => {
      grant.target.kind = 'other'
    },
  ],
  [
    'target key',
    grant => {
      grant.target.key = 'other'
    },
  ],
  [
    'arguments digest',
    grant => {
      grant.arguments.digest = 'other'
    },
  ],
]

describe.each(bindings)('permit reading: %s', (_name, changeBinding) => {
  it('does not allow a mismatched grant repaired after the read', async () => {
    const { answer, read, checkAfterRead } = await fixture()
    changeBinding(answer.grant)
    const decision = await checkAfterRead(answer, () => {
      Object.assign(answer.grant.ref, read.grant.ref)
      Object.assign(answer.grant.operation, read.grant.operation)
      Object.assign(answer.grant.target, read.grant.target)
      Object.assign(answer.grant.arguments, read.grant.arguments)
    })
    expect(answer.grant).toEqual(read.grant)
    expect(decision).toMatchObject({ kind: 'denied', reason: 'permit-mismatch' })
    expectRecomputable(decision)
  })

  it('keeps the original matching grant when a nested binding changes after the read', async () => {
    const { answer, checkAfterRead } = await fixture()
    const decision = await checkAfterRead(answer, () => changeBinding(answer.grant))
    expect(decision.kind).toBe('allowed')
    expectRecomputable(decision)
  })
})

it('retains the grant when the provider replaces the whole grant wrapper', async () => {
  const { answer, read, checkAfterRead } = await fixture()
  answer.grant.operation.name = 'other'
  const decision = await checkAfterRead(answer, () => {
    answer.grant = mutableGrant(read.grant)
  })
  expect(decision).toMatchObject({ kind: 'denied', reason: 'permit-mismatch' })
})

it.each(['unknown', 'unavailable'] as const)(
  'does not turn %s into found after the read',
  async kind => {
    const { answer, checkAfterRead } = await fixture()
    const reused: {
      kind: PermitLookup['kind']
      grant: MutableGrant
      state: PermitState
      diagnostic: string
    } = { ...answer, kind, diagnostic: 'ledger is unavailable' }
    const decision = await checkAfterRead(reused, () => {
      reused.kind = 'found'
    })
    expect(reused.kind).toBe('found')
    expect(Object.isFrozen(reused)).toBe(false)
    expect(decision).toMatchObject(
      kind === 'unknown'
        ? { kind: 'denied', reason: 'permit-unknown' }
        : { kind: 'unavailable', diagnostic: 'ledger is unavailable' },
    )
  },
)

it('retains the diagnostic that was read', async () => {
  const { checkAfterRead } = await fixture()
  const answer = { kind: 'unavailable', diagnostic: 'original outage' } satisfies PermitLookup
  const decision = await checkAfterRead(answer, () => {
    answer.diagnostic = 'changed outage'
  })
  expect(decision).toEqual({ kind: 'unavailable', diagnostic: 'original outage' })
})

it('copies provider wrappers without freezing them or rewriting ledger history', async () => {
  const { answer, input, read, permits, checkAfterRead } = await fixture(true)
  if (read.state.kind !== 'consumed') throw new Error('expected consumed fixture')
  const originalFact = read.state.fact
  const fact = {
    permit: { ...originalFact.permit },
    consumer: { ...originalFact.consumer },
    evidence: { ...originalFact.evidence },
  }
  const state = { kind: 'consumed', fact } satisfies PermitState
  answer.state = state
  const wrappers = [
    answer,
    answer.grant,
    answer.grant.ref,
    answer.grant.operation,
    answer.grant.target,
    answer.grant.arguments,
    answer.grant.granted,
    state,
    fact,
    fact.permit,
    fact.consumer,
    fact.evidence,
    input,
  ]
  const decision = await checkAfterRead(answer, () => {
    expect(wrappers.every(value => !Object.isFrozen(value))).toBe(true)
    answer.grant.ref.tenant = memberTenant()
    Object.assign(answer.grant.granted, {
      owner: 'other',
      record: 'other',
      revision: '2',
      digest: 'other',
    })
    fact.permit.tenant = memberTenant()
    fact.permit.permit = otherPermit()
    Object.assign(fact.consumer, { owner: 'other', work: 'other', position: '1' })
    Object.assign(fact.evidence, { record: 'other', revision: '2', digest: 'other' })
  })
  expect(decision).toMatchObject({ kind: 'denied', reason: 'permit-consumed' })
  expectRecomputable(decision)
  expect(wrappers.every(value => !Object.isFrozen(value))).toBe(true)
  expect(await permits.ledger.lookup({ permit: read.grant.ref })).toEqual(read)
  expect(originalFact.permit.tenant).toBe(input.access.tenant)
  expect(originalFact.evidence.digest).toBe(
    digestOf({
      permit: originalFact.evidence.record.slice('consumption/'.length),
      consumer: originalFact.consumer,
    }),
  )
})
