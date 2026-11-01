// The conformance suite of `SqlStorage` (SPEC 16.1). It runs through the public interface only, so
// it fits the memory double and any provider. It covers the scenarios that need no database:
// C01 to C07, C12, C14 and C16. The scenarios that need SQLite, Workers or files (C08 to C11, C13,
// C15, C17 to C23) belong to the provider package. A pass of this suite does not show them.
import { canonicalJson } from '../canonical.ts'
import { inputDigestV2 } from '../digest.ts'
import type {
  CommitRequestV2,
  CommitResultV2,
  QueryResultV2,
  SqlIdentity,
  SqlMaterialCatalog,
  SqlStorage,
  StorageControl,
} from '../types.ts'
import {
  DOMAIN_A,
  SYSTEM,
  TENANT_A,
  TENANT_B,
  command,
  commitRequest,
  identity,
  registerAll,
  registerSmall,
  registration,
} from './builders.ts'
import { createFixtureMaterials } from './fixtures.ts'

export type SqlConformanceSubject = Readonly<{
  /** Creates a fresh provider for one scenario. The suite closes it. */
  create(
    input: Readonly<{ materials: SqlMaterialCatalog }>,
  ): Promise<Readonly<{ storage: SqlStorage; control: StorageControl }>>
  /** Declared durability of the subject. A memory double declares 'none'. */
  durability: 'none' | 'process' | 'power-loss-tested'
}>

export type SqlConformanceFailure = Readonly<{ id: string; message: string }>

type Scene = Readonly<{
  storage: SqlStorage
  control: StorageControl
  materials: Readonly<{ materials: SqlMaterialCatalog }>
}>

type Scenario = Readonly<{ id: string; title: string; run(scene: Scene): Promise<void> }>

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

/** Equality by RFC 8785 text, so the order of keys does not matter. */
function same(actual: unknown, expected: unknown, message: string): void {
  const text = (value: unknown): string => {
    try {
      return canonicalJson(value)
    } catch {
      return String(JSON.stringify(value))
    }
  }
  expect(
    text(actual) === text(expected),
    `${message}: got ${text(actual)}, expected ${text(expected)}`,
  )
}

function kindOf(result: { kind: string; reason?: string }): string {
  return result.reason === undefined ? result.kind : `${result.kind}/${result.reason}`
}

function committed(result: CommitResultV2): Extract<CommitResultV2, { kind: 'committed' }> {
  if (result.kind !== 'committed') throw new Error(`expected committed, got ${kindOf(result)}`)
  return result
}

const absentIdentity = (over: Partial<SqlIdentity> = {}): SqlIdentity =>
  identity({ transactionDomain: 'absent-domain', ...over })

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const SCENARIOS: readonly Scenario[] = [
  {
    id: 'C01',
    title: 'full identity recognition',
    async run({ storage, materials }) {
      await registerSmall(storage, materials)
      const request = commitRequest(materials)
      const first = committed(await storage.commit(request))
      same(first.identity, request.identity, 'the receipt carries the identity of the request')
      same(await storage.commit(request), first, 'the same identity and input is recognized')
      for (const change of [{ operation: 'other-op' }, { operationKey: 'other-key' }]) {
        const next = committed(
          await storage.commit(commitRequest(materials, { identity: identity(change) })),
        )
        same(next.identity, identity(change), 'a changed dimension is a new identity')
      }
      const conflict = await storage.commit(
        commitRequest(materials, {
          commands: [command('session', { revision: 'changed' }), command('agent-journal')],
        }),
      )
      same(
        conflict,
        { kind: 'identity_conflict', identity: request.identity, existing: first },
        'the same identity with another input conflicts',
      )
      const protocol1 = await storage.commit(
        commitRequest(materials, { identity: { ...identity(), protocolVersion: '1' as never } }),
      )
      expect(
        kindOf(protocol1) === 'rejected_before_accept/unsupported_protocol',
        'protocol 1 is refused',
      )
    },
  },
  {
    id: 'C02',
    title: 'input digest does not depend on order, and facts are strict JSON',
    async run({ storage, materials }) {
      await registerSmall(storage, materials)
      const request = commitRequest(materials)
      const first = committed(await storage.commit(request))
      expect(
        first.inputDigest === inputDigestV2(request),
        'the receipt holds the protocol 2 digest',
      )
      const reordered: CommitRequestV2 = { ...request, commands: [...request.commands].reverse() }
      same(
        await storage.commit(reordered),
        first,
        'the order of commands does not change the digest',
      )
      const lossy = await storage.commit(
        commitRequest(materials, {
          identity: identity({ operationKey: 'lossy' }),
          commands: [
            command('session', { revision: undefined as never }),
            command('agent-journal'),
          ],
        }),
      )
      expect(
        kindOf(lossy) === 'rejected_before_accept/facts_not_json',
        `a fact that is not JSON is refused, got ${kindOf(lossy)}`,
      )
    },
  },
  {
    id: 'C03',
    title: 'dependency order and tie rule',
    async run({ storage, materials }) {
      await registerAll(storage, materials)
      const result = committed(
        await storage.commit(
          commitRequest(materials, {
            combinationVersion: 'all-v1',
            commands: [command('alpha'), command('gamma'), command('beta')],
          }),
        ),
      )
      same(
        result.responses.map(entry => entry.participant),
        ['beta', 'gamma', 'alpha'],
        'participants run in dependency order, ties by name, and only the named ones run',
      )
      const missing = await storage.commit(
        commitRequest(materials, {
          identity: identity({ operationKey: 'missing' }),
          combinationVersion: 'all-v1',
          commands: [command('alpha')],
        }),
      )
      expect(
        kindOf(missing) === 'rejected_before_accept/participant_dependency_missing',
        `a missing provider of a required fact is refused, got ${kindOf(missing)}`,
      )
    },
  },
  {
    id: 'C04',
    title: 'explicit rollback keeps the prefix and the stopping reply',
    async run({ storage, materials }) {
      await registerAll(storage, materials)
      const stopped = await storage.commit(
        commitRequest(materials, {
          combinationVersion: 'all-v1',
          commands: [command('session'), command('probe', { mode: 'conflict' })],
        }),
      )
      expect(stopped.kind === 'rolled_back', `a conflict reply rolls back, got ${kindOf(stopped)}`)
      if (stopped.kind !== 'rolled_back') return
      same(
        stopped.responses.map(entry => `${entry.participant}:${entry.reply.kind}`),
        ['session:participated', 'probe:conflict'],
        'responses end at the stopping participant',
      )
      const next = await storage.commit(
        commitRequest(materials, {
          identity: identity({ operationKey: 'after' }),
          combinationVersion: 'all-v1',
          commands: [command('session'), command('probe', { mode: 'failed' })],
        }),
      )
      expect(next.kind === 'rolled_back', 'a failed reply rolls back')
    },
  },
  {
    id: 'C05',
    title: 'the original response is not lost',
    async run({ storage, materials }) {
      await registerAll(storage, materials)
      const request = commitRequest(materials, {
        combinationVersion: 'all-v1',
        commands: [command('session'), command('probe', { mode: 'conflict' })],
      })
      const first = await storage.commit(request)
      expect(first.kind === 'rolled_back', 'the operation rolls back')
      same(await storage.query(request.identity), first, 'query returns the original response')
      committed(
        await storage.commit(
          commitRequest(materials, {
            identity: identity({ operationKey: 'changes-state' }),
            combinationVersion: 'all-v1',
            commands: [command('session', { revision: 'later' }), command('agent-journal')],
          }),
        ),
      )
      same(
        await storage.query(request.identity),
        first,
        'a later state does not change the response',
      )
      same(await storage.commit(request), first, 'asking again returns the original response')
    },
  },
  {
    id: 'C06',
    title: 'query: receipts, proofs and unknown',
    async run({ storage, materials }) {
      await registerSmall(storage, materials)
      const first = committed(await storage.commit(commitRequest(materials)))
      same(await storage.query(identity()), first, 'a committed receipt is returned')
      const none: QueryResultV2 = await storage.query(identity({ operationKey: 'never' }))
      expect(
        none.kind === 'not_committed',
        `no receipt in a ready domain is not_committed, got ${none.kind}`,
      )
      if (none.kind === 'not_committed')
        expect(
          Object.values(none.proofs).length === 5 && Object.values(none.proofs).every(Boolean),
          'not_committed carries all five proofs',
        )
      const absent = await storage.query(absentIdentity())
      expect(absent.kind === 'unknown', `an absent domain is unknown, got ${absent.kind}`)
    },
  },
  {
    id: 'C07',
    title: 'port and fact cell boundaries',
    async run({ storage, materials }) {
      await registerAll(storage, materials)
      const cases: [string, string][] = [
        ['require-undeclared', 'fact_violation'],
        ['provide-undeclared', 'fact_violation'],
        ['provide-twice', 'fact_violation'],
        ['provide-bad-json', 'fact_violation'],
        ['swallow-violation', 'fact_violation'],
        ['sql', 'port_violation'],
        ['throw', 'participant_threw'],
      ]
      for (const [mode, category] of cases) {
        const result = await storage.commit(
          commitRequest(materials, {
            identity: identity({ operationKey: `port-${mode}` }),
            combinationVersion: 'all-v1',
            commands: [command('session'), command('probe', { mode })],
          }),
        )
        expect(result.kind === 'rolled_back', `${mode} rolls back, got ${kindOf(result)}`)
        if (result.kind !== 'rolled_back') continue
        const last = result.responses[result.responses.length - 1]
        same(
          last?.reply.kind === 'failed' ? last.reply.category : last?.reply.kind,
          category,
          `${mode} is recorded with its category`,
        )
      }
    },
  },
  {
    id: 'C12',
    title: 'cancel is observation only',
    async run({ storage, materials }) {
      await registerSmall(storage, materials)
      const refused = await storage.commit(commitRequest(materials), {
        signal: AbortSignal.abort(),
      })
      expect(
        kindOf(refused) === 'rejected_before_accept/cancelled',
        `an aborted signal is refused, got ${kindOf(refused)}`,
      )
      const none = await storage.query(identity())
      expect(none.kind === 'not_committed', `a refused commit stores nothing, got ${none.kind}`)
      const controller = new AbortController()
      const request = commitRequest(materials, { identity: identity({ operationKey: 'detached' }) })
      const pending = storage.commit(request, { signal: controller.signal })
      controller.abort()
      const detached = await pending
      expect(
        detached.kind === 'unknown' || detached.kind === 'committed',
        `an abort after the call settles unknown or already committed, got ${kindOf(detached)}`,
      )
      let found: QueryResultV2 = await storage.query(request.identity)
      for (let attempt = 0; attempt < 100 && found.kind === 'unknown'; attempt += 1) {
        await sleep(10)
        found = await storage.query(request.identity)
      }
      expect(found.kind === 'committed', `the operation still completes, got ${found.kind}`)
      const read = await storage.read(
        {
          domain: { scope: TENANT_A, transactionDomain: DOMAIN_A },
          handler: 'session.echo',
          protocol: '1',
          requestKey: 'k',
          input: null,
        },
        { signal: AbortSignal.abort() },
      )
      expect(read.kind === 'cancelled', `an aborted read is cancelled, got ${read.kind}`)
    },
  },
  {
    id: 'C14',
    title: 'close',
    async run({ storage, control, materials }) {
      await registerSmall(storage, materials)
      committed(await storage.commit(commitRequest(materials)))
      const closed = await control.close({ initiator: 'disposal' })
      expect(closed.kind === 'closed', 'close ends with closed when nothing is in flight')
      const refused = await storage.commit(
        commitRequest(materials, { identity: identity({ operationKey: 'after-close' }) }),
      )
      expect(
        kindOf(refused) === 'rejected_before_accept/closing',
        `commit after close is closing, got ${kindOf(refused)}`,
      )
      const registered = await storage.registerCombination(
        registration(materials, { transactionDomain: 'other' }),
      )
      expect(
        kindOf(registered) === 'rejected_before_accept/closing',
        'registration after close is closing',
      )
      expect((await storage.query(identity())).kind === 'unknown', 'query after close is unknown')
      const read = await storage.read({
        domain: { scope: TENANT_A, transactionDomain: DOMAIN_A },
        handler: 'session.echo',
        protocol: '1',
        requestKey: 'k',
        input: null,
      })
      expect(kindOf(read) === 'unavailable/closing', 'read after close is closing')
      expect(
        (await control.close({ initiator: 'assembly' })).kind === 'closed',
        'close is idempotent',
      )
    },
  },
  {
    id: 'C16',
    title: 'partition: another scope sees nothing of the domain',
    async run({ storage, materials }) {
      await registerSmall(storage, materials)
      const mine = committed(await storage.commit(commitRequest(materials)))
      for (const scope of [TENANT_B, SYSTEM]) {
        const onMine = await storage.commit(
          commitRequest(materials, { identity: identity({ scope }) }),
        )
        const onAbsent = await storage.commit(
          commitRequest(materials, {
            identity: identity({ scope, transactionDomain: 'absent-domain' }),
          }),
        )
        same(
          [kindOf(onMine), 'diagnostic' in onMine ? onMine.diagnostic : null],
          [kindOf(onAbsent), 'diagnostic' in onAbsent ? onAbsent.diagnostic : null],
          'commit on a domain of another scope equals commit on an absent domain',
        )
        expect(
          kindOf(onMine) === 'rejected_before_accept/combination_unregistered',
          'it is combination_unregistered',
        )
        const queried = await storage.query(identity({ scope }))
        const queriedAbsent = await storage.query(absentIdentity({ scope }))
        same(
          [queried.kind, 'diagnostic' in queried ? queried.diagnostic : null],
          [queriedAbsent.kind, 'diagnostic' in queriedAbsent ? queriedAbsent.diagnostic : null],
          'query on a domain of another scope equals query on an absent domain',
        )
        const taken = await storage.registerCombination(registration(materials, { scope }))
        expect(
          kindOf(taken) === 'rejected_before_accept/domain_occupied',
          'registration finds the domain occupied',
        )
      }
      same(await storage.query(identity()), mine, 'the owner still recognizes its receipt')
      await registerSmall(storage, materials, TENANT_B, 'domain-b')
      const other = committed(
        await storage.commit(
          commitRequest(materials, {
            identity: identity({ scope: TENANT_B, transactionDomain: 'domain-b' }),
          }),
        ),
      )
      expect(
        other.identity.scope.kind === 'tenant' && other.identity.scope.tenant === 'tenant-b',
        'the same operation key in another tenant is a separate identity',
      )
    },
  },
]

/** The ids of the scenarios that this entry runs. */
export const CONFORMANCE_SCENARIO_IDS: readonly string[] = SCENARIOS.map(scenario => scenario.id)

const DURABILITIES = ['none', 'process', 'power-loss-tested']

/**
 * Runs the scenarios against a subject. Every scenario creates its own provider and closes it.
 * Rejects with an Error whose `failures` lists every failed scenario, not only the first.
 */
export async function runSqlStorageConformance(subject: SqlConformanceSubject): Promise<void> {
  if (!DURABILITIES.includes(subject.durability))
    throw new Error(`unknown durability: ${String(subject.durability)}`)
  const fixture = await createFixtureMaterials()
  const failures: SqlConformanceFailure[] = []
  try {
    for (const scenario of SCENARIOS) {
      let made: Awaited<ReturnType<SqlConformanceSubject['create']>> | undefined
      try {
        made = await subject.create({ materials: fixture.materials })
        await scenario.run({ ...made, materials: fixture })
      } catch (error) {
        failures.push({
          id: scenario.id,
          message: `${scenario.title}: ${error instanceof Error ? error.message : String(error)}`,
        })
      } finally {
        await made?.control.close({ initiator: 'disposal' }).catch(() => undefined)
      }
    }
  } finally {
    await fixture.remove()
  }
  if (failures.length > 0)
    throw Object.assign(
      new Error(
        `SQL conformance failed in ${failures.length} scenario(s): ${failures.map(f => `${f.id} (${f.message})`).join('; ')}`,
      ),
      { failures },
    )
}
