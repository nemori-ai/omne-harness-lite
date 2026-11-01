// The memory double, commit side: field rules, the rejection order (SPEC 7.2), execution order,
// receipts, failure categories and recognition. Each case violates one rule and nothing else.
import { describe, expect, it } from 'vitest'
import type { CommitRequestV2, CommitResultV2 } from '@omne-harness/sql-contract'
import {
  TENANT_B,
  all,
  command,
  commitRequest,
  identity,
  loose,
  open,
  small,
  useFixture,
} from './helpers.ts'

const fx = useFixture()

function rejection(result: CommitResultV2): { reason: string; identity: unknown } {
  if (result.kind !== 'rejected_before_accept') throw new Error(`result is ${result.kind}`)
  return { reason: result.reason, identity: result.identity }
}

describe('field rules of commit (SPEC 3.1)', () => {
  const lone = '\ud800'
  const overlong = 'a'.repeat(1025)
  const cases: [string, (base: CommitRequestV2) => CommitRequestV2][] = [
    ['empty operation', b => ({ ...b, identity: { ...b.identity, operation: '' } })],
    ['lone surrogate in operation', b => ({ ...b, identity: { ...b.identity, operation: lone } })],
    [
      'operation over 1024 bytes',
      b => ({ ...b, identity: { ...b.identity, operation: overlong } }),
    ],
    [
      'operation of 513 two-byte characters',
      b => ({ ...b, identity: { ...b.identity, operation: 'é'.repeat(513) } }),
    ],
    ['empty operationKey', b => ({ ...b, identity: { ...b.identity, operationKey: '' } })],
    [
      'empty tenant',
      b => ({ ...b, identity: { ...b.identity, scope: { kind: 'tenant', tenant: '' } } }),
    ],
    [
      'tenant over 1024 bytes',
      b => ({ ...b, identity: { ...b.identity, scope: { kind: 'tenant', tenant: overlong } } }),
    ],
    [
      'transactionDomain over 120 bytes',
      b => ({ ...b, identity: { ...b.identity, transactionDomain: 'd'.repeat(121) } }),
    ],
    ['empty combinationVersion', b => ({ ...b, combinationVersion: '' })],
    ['empty participant name', b => ({ ...b, commands: [command('')] })],
    ['uppercase manifest digest', b => ({ ...b, manifestDigest: 'A'.repeat(64) })],
    ['short manifest digest', b => ({ ...b, manifestDigest: 'a'.repeat(63) })],
    ['no commands', b => ({ ...b, commands: [] })],
    ['missing identity', b => loose<CommitRequestV2>({ ...b, identity: undefined })],
    [
      'system scope with a tenant',
      b => ({ ...b, identity: { ...b.identity, scope: loose({ kind: 'system', tenant: 't' }) } }),
    ],
  ]

  it.each(cases)('rejects %s as field_missing', async (_name, change) => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.commit(change(commitRequest(fx.fixture())))
    expect(rejection(result).reason).toBe('field_missing')
  })

  it('accepts a name of exactly 1024 bytes and a transactionDomain of exactly 120 bytes', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const edge = 'é'.repeat(512)
    const named = await h.storage.commit(
      commitRequest(fx.fixture(), { identity: identity({ operation: edge }) }),
    )
    expect(named.kind).toBe('committed')
    const domain = await h.storage.commit(
      commitRequest(fx.fixture(), { identity: identity({ transactionDomain: 'd'.repeat(120) }) }),
    )
    expect(rejection(domain).reason).toBe('combination_unregistered')
  })
})

describe('single rejection reasons of commit', () => {
  it('closing: after close, with a decodable identity', async () => {
    const h = await open(fx.fixture())
    await small(h)
    await h.control.close({ initiator: 'disposal' })
    const result = rejection(await h.storage.commit(commitRequest(fx.fixture())))
    expect(result.reason).toBe('closing')
    expect(result.identity).toEqual(identity())
  })

  it('cancelled: the signal is aborted at the call, and nothing is stored', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.commit(commitRequest(fx.fixture()), {
      signal: AbortSignal.abort(),
    })
    expect(rejection(result).reason).toBe('cancelled')
    expect((await h.storage.query(identity())).kind).toBe('not_committed')
  })

  it('unsupported_protocol: protocol 1 and no decodable identity', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = rejection(
      await h.storage.commit(
        commitRequest(fx.fixture(), { identity: { ...identity(), protocolVersion: loose('1') } }),
      ),
    )
    expect(result).toEqual({ reason: 'unsupported_protocol', identity: null })
  })

  it('participant_repeated', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), { commands: [command('session'), command('session')] }),
    )
    expect(rejection(result).reason).toBe('participant_repeated')
  })

  it.each([
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['bigint', 1n],
    ['function', () => 1],
  ])('facts_not_json: a %s fact', async (_name, value) => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), { commands: [command('session', loose({ v: value }))] }),
    )
    expect(rejection(result).reason).toBe('facts_not_json')
  })

  it('command_limit: more commands than the limit', async () => {
    const h = await open(fx.fixture(), { maxCommandsPerCommit: 1 })
    await small(h)
    const result = await h.storage.commit(commitRequest(fx.fixture()))
    expect(rejection(result).reason).toBe('command_limit')
  })

  it('command_limit: one command over maxCommandBytes', async () => {
    const h = await open(fx.fixture(), { maxCommandBytes: 40 })
    await small(h)
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), {
        commands: [command('session', { revision: 'x'.repeat(100) })],
      }),
    )
    expect(rejection(result).reason).toBe('command_limit')
  })

  it('command_limit: the whole request over maxRequestBytes', async () => {
    const h = await open(fx.fixture(), { maxRequestBytes: 50 })
    await small(h)
    const result = await h.storage.commit(commitRequest(fx.fixture()))
    expect(rejection(result).reason).toBe('command_limit')
  })

  it('command_limit: nesting deeper than maxJsonDepth', async () => {
    const h = await open(fx.fixture(), { maxJsonDepth: 3 })
    await small(h)
    const deep = { a: { b: { c: { d: 1 } } } }
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), { commands: [command('session', deep)] }),
    )
    expect(rejection(result).reason).toBe('command_limit')
  })

  it('command_limit: more members than maxJsonMembers', async () => {
    const h = await open(fx.fixture(), { maxJsonMembers: 3 })
    await small(h)
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), { commands: [command('session', { a: 1, b: 2, c: 3, d: 4 })] }),
    )
    expect(rejection(result).reason).toBe('command_limit')
  })

  it('field_missing keeps the identity when the identity itself is valid', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = rejection(await h.storage.commit(commitRequest(fx.fixture(), { commands: [] })))
    expect(result).toEqual({ reason: 'field_missing', identity: identity() })
  })

  it('combination_unregistered: an unknown version, an absent domain and another scope alike', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const version = await h.storage.commit(
      commitRequest(fx.fixture(), { combinationVersion: 'nope' }),
    )
    const absent = await h.storage.commit(
      commitRequest(fx.fixture(), { identity: identity({ transactionDomain: 'absent' }) }),
    )
    const other = await h.storage.commit(
      commitRequest(fx.fixture(), { identity: identity({ scope: TENANT_B }) }),
    )
    for (const result of [version, absent, other])
      expect(rejection(result).reason).toBe('combination_unregistered')
    // The result for another scope is the result for an absent domain, diagnostic included.
    if (absent.kind !== 'rejected_before_accept' || other.kind !== 'rejected_before_accept')
      throw new Error('unreachable')
    expect(other.diagnostic).toBe(absent.diagnostic)
  })

  it('manifest_mismatch', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), { manifestDigest: 'f'.repeat(64) }),
    )
    expect(rejection(result).reason).toBe('manifest_mismatch')
  })

  it('participant_not_in_combination', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), { commands: [command('session'), command('beta')] }),
    )
    expect(rejection(result).reason).toBe('participant_not_in_combination')
  })

  it('participant_dependency_missing: the provider of a required fact is not in the commands', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), { commands: [command('agent-journal')] }),
    )
    expect(rejection(result).reason).toBe('participant_dependency_missing')
  })

  it('a rejection writes no receipt and runs no command', async () => {
    const h = await open(fx.fixture())
    await small(h)
    await h.storage.commit(commitRequest(fx.fixture(), { commands: [command('agent-journal')] }))
    expect((await h.storage.query(identity())).kind).toBe('not_committed')
  })
})

describe('rejection order of commit: when two reasons hold, the earlier step wins', () => {
  async function prepared(limits = {}) {
    const h = await open(fx.fixture(), limits)
    await small(h)
    return h
  }

  it('closing before cancelled', async () => {
    const h = await prepared()
    await h.control.close({ initiator: 'disposal' })
    const result = await h.storage.commit(commitRequest(fx.fixture()), {
      signal: AbortSignal.abort(),
    })
    expect(rejection(result).reason).toBe('closing')
  })

  it('cancelled before field_missing', async () => {
    const h = await prepared()
    const request = commitRequest(fx.fixture(), { identity: identity({ operation: '' }) })
    const result = await h.storage.commit(request, { signal: AbortSignal.abort() })
    expect(rejection(result).reason).toBe('cancelled')
  })

  it('field_missing before unsupported_protocol', async () => {
    const h = await prepared()
    const request = commitRequest(fx.fixture(), {
      identity: { ...identity({ operation: '' }), protocolVersion: loose('1') },
    })
    expect(rejection(await h.storage.commit(request)).reason).toBe('field_missing')
  })

  it('unsupported_protocol before participant_repeated', async () => {
    const h = await prepared()
    const request = commitRequest(fx.fixture(), {
      identity: { ...identity(), protocolVersion: loose('1') },
      commands: [command('session'), command('session')],
    })
    expect(rejection(await h.storage.commit(request)).reason).toBe('unsupported_protocol')
  })

  it('participant_repeated before facts_not_json', async () => {
    const h = await prepared()
    const request = commitRequest(fx.fixture(), {
      commands: [command('session', loose({ v: undefined })), command('session')],
    })
    expect(rejection(await h.storage.commit(request)).reason).toBe('participant_repeated')
  })

  it('facts_not_json before command_limit', async () => {
    const h = await prepared({ maxCommandsPerCommit: 1 })
    const request = commitRequest(fx.fixture(), {
      commands: [command('session', loose({ v: undefined })), command('agent-journal')],
    })
    expect(rejection(await h.storage.commit(request)).reason).toBe('facts_not_json')
  })

  it('command_limit before combination_unregistered', async () => {
    const h = await prepared({ maxCommandsPerCommit: 1 })
    const request = commitRequest(fx.fixture(), { combinationVersion: 'nope' })
    expect(rejection(await h.storage.commit(request)).reason).toBe('command_limit')
  })

  it('combination_unregistered before manifest_mismatch', async () => {
    const h = await prepared()
    const request = commitRequest(fx.fixture(), {
      combinationVersion: 'nope',
      manifestDigest: 'f'.repeat(64),
    })
    expect(rejection(await h.storage.commit(request)).reason).toBe('combination_unregistered')
  })

  it('manifest_mismatch before participant_not_in_combination', async () => {
    const h = await prepared()
    const request = commitRequest(fx.fixture(), {
      manifestDigest: 'f'.repeat(64),
      commands: [command('session'), command('beta')],
    })
    expect(rejection(await h.storage.commit(request)).reason).toBe('manifest_mismatch')
  })

  it('participant_not_in_combination before participant_dependency_missing', async () => {
    const h = await prepared()
    const request = commitRequest(fx.fixture(), {
      commands: [command('agent-journal'), command('beta')],
    })
    expect(rejection(await h.storage.commit(request)).reason).toBe('participant_not_in_combination')
  })

  it('a worker-side rejection comes before recognition of an existing receipt', async () => {
    const h = await prepared()
    expect((await h.storage.commit(commitRequest(fx.fixture()))).kind).toBe('committed')
    const again = commitRequest(fx.fixture(), { manifestDigest: 'f'.repeat(64) })
    expect(rejection(await h.storage.commit(again)).reason).toBe('manifest_mismatch')
  })
})

describe('execution and receipts', () => {
  it('executes the commands in dependency order and records every response', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), {
        commands: [command('agent-journal'), command('session', { revision: 'r9' })],
      }),
    )
    if (result.kind !== 'committed') throw new Error(result.kind)
    expect(result.responses.map(r => r.participant)).toEqual(['session', 'agent-journal'])
    expect(result.responses.map(r => r.reply.response)).toEqual([{ revision: 'r9' }, { saw: 'r9' }])
  })

  it('breaks ties between ready participants by name, and runs only the named ones', async () => {
    const h = await open(fx.fixture())
    await all(h)
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), {
        combinationVersion: 'all-v1',
        commands: [command('alpha'), command('gamma'), command('beta')],
      }),
    )
    if (result.kind !== 'committed') throw new Error(result.kind)
    expect(result.responses.map(r => r.participant)).toEqual(['beta', 'gamma', 'alpha'])
  })

  it('recognizes the same identity with the same input and returns the first receipt', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const first = await h.storage.commit(commitRequest(fx.fixture()))
    const reordered = commitRequest(fx.fixture(), {
      commands: [...commitRequest(fx.fixture()).commands].reverse(),
    })
    expect(await h.storage.commit(reordered)).toEqual(first)
  })

  it('reports identity_conflict with the existing receipt for the same identity and another input', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const first = await h.storage.commit(commitRequest(fx.fixture()))
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), {
        commands: [command('session', { revision: 'other' }), command('agent-journal')],
      }),
    )
    expect(result).toEqual({ kind: 'identity_conflict', identity: identity(), existing: first })
  })

  it.each([
    ['operation', { operation: 'other' }],
    ['operationKey', { operationKey: 'other' }],
  ])('treats a different %s as a new identity', async (_name, change) => {
    const h = await open(fx.fixture())
    await small(h)
    await h.storage.commit(commitRequest(fx.fixture()))
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), { identity: identity(change) }),
    )
    expect(result.kind).toBe('committed')
  })

  it('records inputDigest, combination version and manifest digest in the receipt', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const request = commitRequest(fx.fixture())
    const result = await h.storage.commit(request)
    if (result.kind !== 'committed') throw new Error(result.kind)
    const { inputDigestV2 } = await import('@omne-harness/sql-contract')
    expect(result.inputDigest).toBe(inputDigestV2(request))
    expect(result.combinationVersion).toBe('small-v1')
    expect(result.manifestDigest).toBe(request.manifestDigest)
  })
})

describe('failed and stopping replies roll the operation back (SPEC 7.6)', () => {
  async function stopped(facts: Record<string, unknown>, limits = {}) {
    const h = await open(fx.fixture(), limits)
    await all(h)
    const result = await h.storage.commit(
      commitRequest(fx.fixture(), {
        combinationVersion: 'all-v1',
        commands: [command('session'), command('probe', loose(facts))],
      }),
    )
    if (result.kind !== 'rolled_back') throw new Error(`result is ${result.kind}`)
    const last = result.responses[result.responses.length - 1]
    return { h, result, last }
  }

  it('keeps the prefix and the stopping entry, and drops later participants', async () => {
    const { result } = await stopped({ mode: 'conflict' })
    expect(result.responses.map(r => `${r.participant}:${r.reply.kind}`)).toEqual([
      'session:participated',
      'probe:conflict',
    ])
  })

  it('stores conflict and unsupported bases as given', async () => {
    expect((await stopped({ mode: 'conflict' })).last?.reply).toEqual({
      kind: 'conflict',
      basis: { why: 'conflict-basis' },
    })
    expect((await stopped({ mode: 'unsupported' })).last?.reply).toEqual({
      kind: 'unsupported',
      basis: { why: 'unsupported-basis' },
    })
  })

  it.each([
    ['failed', 'participant_reported'],
    ['throw', 'participant_threw'],
    ['invalid', 'invalid_reply'],
    ['unknown-kind', 'invalid_reply'],
    ['require-undeclared', 'fact_violation'],
    ['provide-undeclared', 'fact_violation'],
    ['provide-twice', 'fact_violation'],
    ['provide-bad-json', 'fact_violation'],
    ['swallow-violation', 'fact_violation'],
    ['sql', 'port_violation'],
  ])('mode %s is recorded as failed with category %s', async (mode, category) => {
    const { last } = await stopped({ mode })
    expect(last?.reply).toMatchObject({ kind: 'failed', category })
  })

  it('a response over maxResponseBytes is failed with response_limit', async () => {
    const { last } = await stopped({ mode: 'big' }, { maxResponseBytes: 1000 })
    expect(last?.reply).toMatchObject({ kind: 'failed', category: 'response_limit' })
  })

  it('responses over maxOperationResponseBytes together are failed with response_limit', async () => {
    const h = await open(fx.fixture(), { maxOperationResponseBytes: 20 })
    await small(h)
    const result = await h.storage.commit(commitRequest(fx.fixture()))
    if (result.kind !== 'rolled_back') throw new Error(result.kind)
    expect(result.responses.map(r => r.participant)).toEqual(['session', 'agent-journal'])
    expect(result.responses[1]?.reply).toMatchObject({ kind: 'failed', category: 'response_limit' })
  })

  it('keeps the original response when the operation is asked again and by query', async () => {
    const { h, result } = await stopped({ mode: 'conflict' })
    const request = commitRequest(fx.fixture(), {
      combinationVersion: 'all-v1',
      commands: [command('session'), command('probe', { mode: 'conflict' })],
    })
    expect(await h.storage.commit(request)).toEqual(result)
    expect(await h.storage.query(identity())).toEqual(result)
  })

  it('bounds a reported diagnostic by maxDiagnosticBytes', async () => {
    const { last } = await stopped({ mode: 'failed' }, { maxDiagnosticBytes: 5 })
    if (last?.reply.kind !== 'failed') throw new Error('not failed')
    expect(Buffer.byteLength(last.reply.diagnostic)).toBeLessThanOrEqual(5)
  })
})

describe('observation cancel (SPEC 7.1)', () => {
  it('settles unknown with observer_detached when the signal aborts after the call, and keeps the operation', async () => {
    const h = await open(fx.fixture())
    await small(h)
    const controller = new AbortController()
    const pending = h.storage.commit(commitRequest(fx.fixture()), { signal: controller.signal })
    controller.abort()
    const result = await pending
    expect(result).toMatchObject({ kind: 'unknown', diagnostic: 'observer_detached' })
    // The caller recognizes the original identity afterwards.
    expect((await h.storage.query(identity())).kind).toBe('committed')
  })
})
