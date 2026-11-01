// The memory double, registration side: registerCombination (SPEC 6), query (SPEC 8), read
// (SPEC 9), partition by scope (SPEC 2.5, 5.5) and close. Each case violates one rule only.
import { describe, expect, it } from 'vitest'
import type {
  CombinationRegistrationV2,
  ReadRequest,
  ReadResult,
  RegisterResultV2,
} from '@omne-harness/sql-contract'
import {
  DOMAIN_A,
  SYSTEM,
  TENANT_A,
  TENANT_B,
  command,
  commitRequest,
  digestOf,
  identity,
  loose,
  open,
  registration,
  small,
  useFixture,
} from './helpers.ts'

const fx = useFixture()

function rejected(result: RegisterResultV2): string {
  if (result.kind !== 'rejected_before_accept') throw new Error(`result is ${result.kind}`)
  return result.reason
}

describe('registerCombination', () => {
  it('stores the participants sorted and returns the stored registration', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { participants: ['session', 'agent-journal'] }),
    )
    expect(result).toEqual({
      kind: 'registered',
      registration: registration(fx.fixture(), { participants: ['agent-journal', 'session'] }),
    })
  })

  it('is idempotent for the same registration in any participant order', async () => {
    const h = await open(fx.fixture())
    const first = await h.storage.registerCombination(registration(fx.fixture()))
    const again = await h.storage.registerCombination(
      registration(fx.fixture(), { participants: ['session', 'agent-journal'] }),
    )
    expect(again).toEqual(first)
  })

  it('keeps the old version when a new version is registered', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const second = await h.storage.registerCombination(
      registration(fx.fixture(), { combinationVersion: 'small-v2', participants: ['session'] }),
    )
    expect(second.kind).toBe('registered')
    expect((await h.storage.commit(commitRequest(fx.fixture()))).kind).toBe('committed')
    const viaV2 = await h.storage.commit(
      commitRequest(fx.fixture(), {
        identity: identity({ operationKey: 'v2' }),
        combinationVersion: 'small-v2',
        manifestDigest: digestOf(fx.fixture(), ['session']),
        commands: [command('session')],
      }),
    )
    expect(viaV2.kind).toBe('committed')
  })

  const fieldCases: [string, Partial<CombinationRegistrationV2>][] = [
    ['empty combinationVersion', { combinationVersion: '' }],
    ['empty transactionDomain', { transactionDomain: '' }],
    ['transactionDomain over 120 bytes', { transactionDomain: 'd'.repeat(121) }],
    ['empty tenant', { scope: { kind: 'tenant', tenant: '' } }],
    ['lone surrogate in the tenant', { scope: { kind: 'tenant', tenant: '\ud800' } }],
    ['system scope with a tenant', { scope: loose({ kind: 'system', tenant: 't' }) }],
    ['uppercase manifest digest', { manifestDigest: 'A'.repeat(64) }],
    ['short manifest digest', { manifestDigest: 'a'.repeat(63) }],
    [
      'participant name over 1024 bytes',
      { participants: ['a'.repeat(1025)], manifestDigest: 'a'.repeat(64) },
    ],
  ]
  it.each(fieldCases)('rejects %s as field_missing', async (_name, change) => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(registration(fx.fixture(), change))
    expect(rejected(result)).toBe('field_missing')
  })

  it('participant_empty: an empty list and an empty name', async () => {
    const h = await open(fx.fixture())
    for (const participants of [[], ['']]) {
      const result = await h.storage.registerCombination(
        registration(fx.fixture(), { participants, manifestDigest: 'a'.repeat(64) }),
      )
      expect(rejected(result)).toBe('participant_empty')
    }
  })

  it('participant_repeated', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), {
        participants: ['session', 'session'],
        manifestDigest: 'a'.repeat(64),
      }),
    )
    expect(rejected(result)).toBe('participant_repeated')
  })

  it('material_unavailable: a participant that the catalog lacks', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { participants: ['ghost'], manifestDigest: 'a'.repeat(64) }),
    )
    expect(rejected(result)).toBe('material_unavailable')
  })

  it('combination_invalid: a required fact has no provider', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { participants: ['needy'], manifestDigest: 'a'.repeat(64) }),
    )
    expect(rejected(result)).toBe('combination_invalid')
  })

  it('manifest_mismatch', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { manifestDigest: 'f'.repeat(64) }),
    )
    expect(rejected(result)).toBe('manifest_mismatch')
  })

  it('registration_conflict: the same key with other participants', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { participants: ['session'] }),
    )
    expect(rejected(result)).toBe('registration_conflict')
  })

  it('domain_occupied: the domain is bound to another scope, and the diagnostic says nothing about it', async () => {
    const h = await open(fx.fixture())
    await small(h)
    for (const scope of [TENANT_B, SYSTEM]) {
      const result = await h.storage.registerCombination(registration(fx.fixture(), { scope }))
      expect(rejected(result)).toBe('domain_occupied')
      if (result.kind !== 'rejected_before_accept') throw new Error('unreachable')
      expect(JSON.stringify(result)).not.toContain('tenant-a')
    }
  })

  it('a rejected registration stores nothing', async () => {
    const h = await open(fx.fixture())
    await h.storage.registerCombination(
      registration(fx.fixture(), { manifestDigest: 'f'.repeat(64) }),
    )
    expect((await h.storage.commit(commitRequest(fx.fixture()))).kind).toBe(
      'rejected_before_accept',
    )
    // The domain is still free for another scope.
    const other = await h.storage.registerCombination(
      registration(fx.fixture(), { scope: TENANT_B }),
    )
    expect(other.kind).toBe('registered')
  })
})

describe('rejection order of registerCombination: when two reasons hold, the earlier step wins', () => {
  const bad = 'a'.repeat(64)

  it('closing before field_missing', async () => {
    const h = await open(fx.fixture())
    await h.control.close({ initiator: 'disposal' })
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { combinationVersion: '' }),
    )
    expect(rejected(result)).toBe('closing')
  })

  it('field_missing before participant_empty', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { combinationVersion: '', participants: [] }),
    )
    expect(rejected(result)).toBe('field_missing')
  })

  it('participant_empty before participant_repeated', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { participants: ['', ''], manifestDigest: bad }),
    )
    expect(rejected(result)).toBe('participant_empty')
  })

  it('participant_repeated before material_unavailable', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { participants: ['ghost', 'ghost'], manifestDigest: bad }),
    )
    expect(rejected(result)).toBe('participant_repeated')
  })

  it('material_unavailable before combination_invalid', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { participants: ['needy', 'ghost'], manifestDigest: bad }),
    )
    expect(rejected(result)).toBe('material_unavailable')
  })

  it('combination_invalid before manifest_mismatch', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { participants: ['needy'], manifestDigest: bad }),
    )
    expect(rejected(result)).toBe('combination_invalid')
  })

  it('manifest_mismatch before domain_occupied', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.registerCombination(
      registration(fx.fixture(), { scope: TENANT_B, manifestDigest: bad }),
    )
    expect(rejected(result)).toBe('manifest_mismatch')
  })
})

describe('query', () => {
  it('returns the committed receipt', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const committed = await h.storage.commit(commitRequest(fx.fixture()))
    expect(await h.storage.query(identity())).toEqual(committed)
  })

  it('returns not_committed with the five proofs for a ready domain without a receipt', async () => {
    const h = await open(fx.fixture())
    await small(h)
    expect(await h.storage.query(identity())).toEqual({
      kind: 'not_committed',
      identity: identity(),
      proofs: {
        writerGenerationExcluded: true,
        oldTransactionTerminated: true,
        databaseRecoveryFinished: true,
        authoritativeReadSucceeded: true,
        operationNotQueued: true,
      },
    })
  })

  it('returns unknown for an absent domain and for another scope, with equal diagnostics', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const absent = await h.storage.query(identity({ transactionDomain: 'absent' }))
    const other = await h.storage.query(identity({ scope: TENANT_B }))
    expect(absent.kind).toBe('unknown')
    expect(other.kind).toBe('unknown')
    if (absent.kind !== 'unknown' || other.kind !== 'unknown') throw new Error('unreachable')
    expect(other.diagnostic).toBe(absent.diagnostic)
  })

  it('returns unknown for a field violation and for protocol 1', async () => {
    const h = await open(fx.fixture())
    await small(h)
    expect((await h.storage.query(identity({ operation: '' }))).kind).toBe('unknown')
    expect((await h.storage.query(loose({ ...identity(), protocolVersion: '1' }))).kind).toBe(
      'unknown',
    )
  })

  it('returns unknown after close', async () => {
    const h = await open(fx.fixture())
    await small(h)
    await h.storage.commit(commitRequest(fx.fixture()))
    await h.control.close({ initiator: 'disposal' })
    expect((await h.storage.query(identity())).kind).toBe('unknown')
  })

  it('recognizes an operation after the caller dropped it: query waits for the operation in flight', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const pending = h.storage.commit(commitRequest(fx.fixture()))
    const queried = h.storage.query(identity())
    expect((await pending).kind).toBe('committed')
    expect((await queried).kind).toBe('committed')
  })
})

describe('partition by scope', () => {
  it('another scope gets the same results as an absent domain from every operation', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const request = commitRequest(fx.fixture(), { identity: identity({ scope: TENANT_B }) })
    const ghost = commitRequest(fx.fixture(), {
      identity: identity({ transactionDomain: 'absent', scope: TENANT_B }),
    })
    expect(await h.storage.commit(request)).toEqual({
      ...(await h.storage.commit(ghost)),
      identity: request.identity,
    })
    const read = (domain: ReadRequest['domain']): Promise<ReadResult> =>
      h.storage.read({ domain, handler: 'session.echo', protocol: '1', requestKey: 'r', input: 1 })
    expect(await read({ scope: TENANT_B, transactionDomain: DOMAIN_A })).toEqual(
      await read({ scope: TENANT_B, transactionDomain: 'absent' }),
    )
  })

  it('a system scope cannot use a tenant domain, and a tenant scope cannot use a system domain', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const system = await h.storage.commit(
      commitRequest(fx.fixture(), { identity: identity({ scope: SYSTEM }) }),
    )
    expect(system).toMatchObject({
      kind: 'rejected_before_accept',
      reason: 'combination_unregistered',
    })
    const registered = await h.storage.registerCombination(
      registration(fx.fixture(), { scope: SYSTEM, transactionDomain: 'sys' }),
    )
    expect(registered.kind).toBe('registered')
    const tenant = await h.storage.commit(
      commitRequest(fx.fixture(), { identity: identity({ transactionDomain: 'sys' }) }),
    )
    expect(tenant).toMatchObject({
      kind: 'rejected_before_accept',
      reason: 'combination_unregistered',
    })
  })

  it('the same operation key in two tenants neither recognizes nor conflicts', async () => {
    const h = await open(fx.fixture())
    await small(h)
    await h.storage.registerCombination(
      registration(fx.fixture(), { scope: TENANT_B, transactionDomain: 'domain-b' }),
    )
    const a = await h.storage.commit(commitRequest(fx.fixture()))
    const b = await h.storage.commit(
      commitRequest(fx.fixture(), {
        identity: identity({ scope: TENANT_B, transactionDomain: 'domain-b' }),
        commands: [command('session', { revision: 'other' }), command('agent-journal')],
      }),
    )
    expect(a.kind).toBe('committed')
    expect(b.kind).toBe('committed')
    expect(await h.storage.query(identity())).toEqual(a)
  })
})

describe('read', () => {
  const echo = (over: Partial<ReadRequest> = {}): ReadRequest => ({
    domain: { scope: TENANT_A, transactionDomain: DOMAIN_A },
    handler: 'session.echo',
    protocol: '1',
    requestKey: 'req-1',
    input: { n: 1 },
    ...over,
  })

  const reasonOf = (result: ReadResult): string => {
    if (result.kind !== 'unavailable') throw new Error(`result is ${result.kind}`)
    return result.reason
  }

  it('runs the handler and returns its output with the request key', async () => {
    const h = await open(fx.fixture())
    await small(h)
    expect(await h.storage.read(echo())).toEqual({
      kind: 'read',
      requestKey: 'req-1',
      output: { echo: { n: 1 } },
    })
  })

  it('a repeated request key does not reuse an earlier result', async () => {
    const h = await open(fx.fixture())
    await small(h)
    await h.storage.read(echo({ input: 1 }))
    expect(await h.storage.read(echo({ input: 2 }))).toMatchObject({ output: { echo: 2 } })
  })

  it('closing', async () => {
    const h = await open(fx.fixture())
    await small(h)
    await h.control.close({ initiator: 'disposal' })
    expect(reasonOf(await h.storage.read(echo()))).toBe('closing')
  })

  it('cancelled: the signal is aborted at the call', async () => {
    const h = await open(fx.fixture())
    await small(h)
    expect(await h.storage.read(echo(), { signal: AbortSignal.abort() })).toEqual({
      kind: 'cancelled',
      requestKey: 'req-1',
    })
  })

  it('invalid: a field violation, with a null request key when that key is the bad field', async () => {
    const h = await open(fx.fixture())
    await small(h)
    expect(reasonOf(await h.storage.read(echo({ handler: '' })))).toBe('invalid')
    const noKey = await h.storage.read(echo({ requestKey: '' }))
    expect(noKey).toMatchObject({ kind: 'unavailable', reason: 'invalid', requestKey: null })
  })

  it('read_limit: the input is over maxReadInputBytes', async () => {
    const h = await open(fx.fixture(), { maxReadInputBytes: 10 })
    await small(h)
    expect(reasonOf(await h.storage.read(echo({ input: 'x'.repeat(50) })))).toBe('read_limit')
  })

  it('handler_unavailable: a handler or protocol that the catalog lacks', async () => {
    const h = await open(fx.fixture())
    await small(h)
    expect(reasonOf(await h.storage.read(echo({ handler: 'nope' })))).toBe('handler_unavailable')
    expect(reasonOf(await h.storage.read(echo({ protocol: '9' })))).toBe('handler_unavailable')
  })

  it('domain_unavailable: an absent domain', async () => {
    const h = await open(fx.fixture())
    const result = await h.storage.read(
      echo({ domain: { scope: TENANT_A, transactionDomain: 'absent' } }),
    )
    expect(reasonOf(result)).toBe('domain_unavailable')
  })

  it('schema_unavailable: the domain lacks a migration that the handler requires', async () => {
    const h = await open(fx.fixture())
    await small(h)
    expect(reasonOf(await h.storage.read(echo({ handler: 'extra.echo' })))).toBe(
      'schema_unavailable',
    )
  })

  it('read_limit: the output is over maxOutputBytes, and no truncated output is returned', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.read(echo({ handler: 'session.big' }))
    expect(reasonOf(result)).toBe('read_limit')
    expect(JSON.stringify(result)).not.toContain('xxxxx')
  })

  it('read_failed: the handler reports failure or throws', async () => {
    const h = await open(fx.fixture())
    await small(h)
    expect(reasonOf(await h.storage.read(echo({ handler: 'session.fail' })))).toBe('read_failed')
    expect(reasonOf(await h.storage.read(echo({ handler: 'session.throw' })))).toBe('read_failed')
  })

  it('does not create a domain', async () => {
    const h = await open(fx.fixture())
    await h.storage.read(echo({ domain: { scope: TENANT_A, transactionDomain: 'fresh' } }))
    const registered = await h.storage.registerCombination(
      registration(fx.fixture(), { scope: TENANT_B, transactionDomain: 'fresh' }),
    )
    expect(registered.kind).toBe('registered')
  })

  it('closing before cancelled before invalid, in this order', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const bad = echo({ handler: '' })
    expect(await h.storage.read(bad, { signal: AbortSignal.abort() })).toMatchObject({
      kind: 'cancelled',
    })
    await h.control.close({ initiator: 'disposal' })
    expect(reasonOf(await h.storage.read(bad, { signal: AbortSignal.abort() }))).toBe('closing')
  })

  it('invalid before read_limit before handler_unavailable', async () => {
    const h = await open(fx.fixture(), { maxReadInputBytes: 10 })
    await small(h)
    const big = 'x'.repeat(50)
    expect(reasonOf(await h.storage.read(echo({ handler: '', input: big })))).toBe('invalid')
    expect(reasonOf(await h.storage.read(echo({ handler: 'nope', input: big })))).toBe('read_limit')
  })

  it('handler_unavailable before domain_unavailable before schema_unavailable', async () => {
    const h = await open(fx.fixture())
    const absent = { scope: TENANT_A, transactionDomain: 'absent' }
    expect(reasonOf(await h.storage.read(echo({ handler: 'nope', domain: absent })))).toBe(
      'handler_unavailable',
    )
    await small(h)
    expect(reasonOf(await h.storage.read(echo({ handler: 'extra.echo', domain: absent })))).toBe(
      'domain_unavailable',
    )
  })
})

describe('close', () => {
  it('returns closed, and again closed when called twice', async () => {
    const h = await open(fx.fixture())
    await small(h)
    expect(await h.control.close({ initiator: 'assembly' })).toEqual({ kind: 'closed' })
    expect(await h.control.close({ initiator: 'disposal' })).toEqual({ kind: 'closed' })
    expect(() => h.control.assemblyReportSettled()).not.toThrow()
  })

  it('lets the running commit finish as committed, and withdraws the one that did not start', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const running = h.storage.commit(commitRequest(fx.fixture()))
    const waiting = h.storage.commit(
      commitRequest(fx.fixture(), { identity: identity({ operationKey: 'second' }) }),
    )
    const closed = await h.control.close({ initiator: 'assembly' })
    expect(closed).toEqual({ kind: 'closed' })
    expect((await running).kind).toBe('committed')
    expect(await waiting).toMatchObject({ kind: 'unknown', diagnostic: 'withdrawn_before_start' })
  })

  it('does not turn a withdrawn commit into a rollback or a not_committed proof', async () => {
    const h = await open(fx.fixture())
    await small(h)
    void h.storage.commit(commitRequest(fx.fixture()))
    const waiting = await Promise.all([
      h.storage.commit(
        commitRequest(fx.fixture(), { identity: identity({ operationKey: 'second' }) }),
      ),
      h.control.close({ initiator: 'disposal' }),
    ])
    expect(waiting[0].kind).toBe('unknown')
  })
})

describe('concurrent calls on one identity', () => {
  it('both callers get the same receipt', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const [first, second] = await Promise.all([
      h.storage.commit(commitRequest(fx.fixture())),
      h.storage.commit(commitRequest(fx.fixture())),
    ])
    expect(first.kind).toBe('committed')
    expect(second).toEqual(first)
  })

  it('the first attempt keeps the interpretation: the other input gets identity_conflict', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const [first, second] = await Promise.all([
      h.storage.commit(commitRequest(fx.fixture())),
      h.storage.commit(
        commitRequest(fx.fixture(), {
          commands: [command('session', { revision: 'other' }), command('agent-journal')],
        }),
      ),
    ])
    expect(first.kind).toBe('committed')
    expect(second).toMatchObject({ kind: 'identity_conflict', existing: first })
  })
})
