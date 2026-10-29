import assert from 'node:assert/strict'
import { decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Outcome } from '@omne-harness/operation-result'
import type { Failure, Reply } from './evaluation.ts'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeConsumptionId,
  type Access,
  type DurableEvidence,
} from './identity.ts'
import type { ReceivedCommitInput, ReceivedCommitResult, ReceivedCommitValue } from './receiving.ts'
import type { AgentJournalEntriesFixture } from './testing-journal-entries.ts'
import {
  sampleReceivedModelResult,
  sampleReceivedModelAccount,
  sampleReceivedToolAccount,
  sampleStartFence,
} from './testing-journal-samples.ts'
import type { RequiredReceivedCommits } from './testing-received-fixture.ts'
import { doubleEvidence, type ConformanceCase } from './testing-case.ts'

function decoded<T>(outcome: Outcome<T, unknown>): T {
  assert.ok('ok' in outcome, 'suite identity must be valid')
  return outcome.ok
}
const operation = (name: string) => decoded(decodeAgentOperationId(`joint-${name}`))
async function ok<T>(reply: Reply<T>): Promise<T> {
  const result = await reply
  assert.ok('ok' in result, `expected success, got ${JSON.stringify(result)}`)
  return result.ok
}
async function committed(reply: Reply<ReceivedCommitResult>): Promise<ReceivedCommitValue> {
  const result = await ok(reply)
  assert.equal(result.kind, 'committed', 'commit should establish custody')
  assert.ok(result.kind === 'committed')
  return result.value
}
async function refused<T>(
  reply: Reply<T>,
  kind: Failure['kind'],
  message: string,
): Promise<Failure> {
  const result = await reply
  assert.ok('failure' in result, message)
  assert.equal(result.failure.kind, kind, message)
  return result.failure
}

export function receivedCommitConformance<P, B extends ContentBlock>(
  fixture: AgentJournalEntriesFixture<P>,
  profile: RequiredReceivedCommits<P, B>,
): readonly ConformanceCase[] {
  assert.equal(profile.received, 'required', 'received profile must explicitly be required')
  const joint = profile.joint
  assert.ok(joint, 'required received profile needs a joint fixture')
  assert.equal(joint.entries, fixture.entries, 'required fixture must share the entries port')
  for (const [name, method] of Object.entries({
    commit: joint.received?.commit,
    query: joint.received?.query,
    read: joint.materials?.read,
    preserve: joint.materials?.preserve,
    journalQuery: joint.journal?.query,
    bind: joint.bind,
    material: joint.material,
    inspect: joint.inspect,
    pause: joint.pause,
    fault: joint.fault,
    exclude: joint.exclude,
    qualify: joint.qualify,
    retainSaved: joint.retainSaved,
    loseMaterial: joint.loseMaterial,
  }))
    assert.equal(typeof method, 'function', `required received fixture lacks ${name}`)
  const { access, otherAccess } = fixture
  const prepare = async (
    name: string,
    who: Access<P> = access,
  ): Promise<ReceivedCommitInput<P, B>> => {
    const execution = decoded(decodeAgentExecutionId(`joint-${name}`))
    await fixture.open(who, execution)
    const { material: _source, ...entry } = sampleReceivedModelResult(who.tenant, `joint-${name}`)
    const input = {
      ...who,
      execution,
      operation: operation(name),
      entry,
      material: joint.material(name),
    }
    await joint.bind(input)
    return input
  }
  const stats = (input: ReceivedCommitInput<P, B>) => joint.inspect(input, input.execution)
  const events = (input: ReceivedCommitInput<P, B>) => fixture.events(input, input.execution)
  const assertVisible = async (input: ReceivedCommitInput<P, B>, value: ReceivedCommitValue) => {
    assert.deepEqual(
      await fixture.read(input, input.execution),
      [value.entry],
      'joint entry must appear in the original public read',
    )
    assert.deepEqual(
      await ok(joint.materials.read({ ...input, source: value.entry.material })),
      input.material,
      'published entry must reference the complete readable material',
    )
    assert.equal(
      value.saved.owner,
      input.entry.consumer.owner,
      'saved must belong to the frozen consumer',
    )
    assert.deepEqual(
      await ok(joint.journal.query(input)),
      { kind: 'committed', receipt: value.receipt },
      'Journal query must return the same original receipt',
    )
  }
  const variants = [
    { name: 'Model account', sample: sampleReceivedModelAccount },
    { name: 'Tool account', sample: sampleReceivedToolAccount },
    {
      name: 'Tool result',
      sample: (tenant: Access<P>['tenant'], name: string) => {
        const entry = sampleReceivedToolAccount(tenant, name)
        assert.equal(entry.delivery.producer, 'tool')
        assert.ok(entry.delivery.producer === 'tool')
        return {
          ...entry,
          delivery: {
            producer: 'tool' as const,
            key: {
              kind: 'result' as const,
              producer: 'tool' as const,
              reference: entry.delivery.key.reference,
              result: decoded(decodeToolResultVersion(`result-${name}`)),
            },
            account: null,
          },
        }
      },
    },
  ]
  return [
    ...variants.map(({ name, sample }): ConformanceCase => ({
      name: `received ${name} commits and recalls the original custody`,
      async run() {
        const execution = decoded(decodeAgentExecutionId(`variant-${name.replaceAll(' ', '-')}`))
        await fixture.open(access, execution)
        const { material: _source, ...entry } = sample(
          access.tenant,
          `variant-${name.replaceAll(' ', '-')}`,
        )
        const input = {
          ...access,
          execution,
          operation: operation(name.replaceAll(' ', '-')),
          entry,
          material: joint.material(name),
        }
        await joint.bind(input)
        const value = await committed(joint.received.commit(input))
        assert.deepEqual(
          await committed(joint.received.commit(input)),
          value,
          `${name} same operation must retain original custody`,
        )
        assert.deepEqual(
          await committed(
            joint.received.commit({
              ...input,
              operation: operation(`${name.replaceAll(' ', '-')}-retry`),
            }),
          ),
          value,
          `${name} another operation must retain original custody`,
        )
        await assertVisible(input, value)
        assert.deepEqual(await stats(input), { revision: 1, entries: 1, materials: 1 })
      },
    })),
    {
      name: 'received legacy same operation rejects a changed consumer',
      async run() {
        const input = await prepare('legacy-changed-consumer')
        const value = await committed(joint.received.commit(input))
        await refused(
          joint.entries.record({
            ...input,
            authority: null,
            entry: {
              ...value.entry,
              consumer: { ...value.entry.consumer, work: 'different-work' },
            },
          }),
          'conflict',
          'legacy same operation must reject a changed consumer',
        )
        await assertVisible(input, value)
        assert.deepEqual(await stats(input), { revision: 1, entries: 1, materials: 1 })
      },
    },
    {
      name: 'received paused publication rechecks revoked qualification',
      async run() {
        const input = await prepare('revoked-during-pause')
        const pause = joint.pause(input)
        const pending = joint.received.commit(input)
        const source = await pause.reached
        joint.qualify(input, input.execution, 'denied')
        pause.release()
        await assert.doesNotReject(async () => {
          await refused(pending, 'denied', 'revoked qualification must deny publication')
        }, 'revoked qualification must return denied instead of throwing')
        joint.qualify(input, input.execution, 'allowed')
        assert.deepEqual(
          await fixture.read(input, input.execution),
          [],
          'revoked publication must leave no entry',
        )
        assert.ok(
          'failure' in (await joint.materials.read({ ...input, source })),
          'revoked publication must leave no material',
        )
        assert.deepEqual(
          await stats(input),
          { revision: 0, entries: 0, materials: 0 },
          'revoked publication must leave no revision or half',
        )
      },
    },
    {
      name: 'received joint publication keeps both halves invisible until one publication',
      async run() {
        const input = await prepare('visibility')
        const pause = joint.pause(input)
        const pending = joint.received.commit(input)
        try {
          const source = await pause.reached
          assert.deepEqual(
            await fixture.read(input, input.execution),
            [],
            'entry must not be visible before publication',
          )
          const read = await joint.materials.read({ ...input, source })
          assert.ok('failure' in read, 'material must not be visible before publication')
          assert.deepEqual(
            await stats(input),
            { revision: 0, entries: 0, materials: 0 },
            'no half may be committed before publication',
          )
          assert.deepEqual(
            await ok(joint.received.query(input)),
            { kind: 'unknown' },
            'a pending publication is not an exclusion',
          )
        } finally {
          pause.release()
        }
        const value = await committed(pending)
        await assertVisible(input, value)
        assert.deepEqual(
          await stats(input),
          { revision: 1, entries: 1, materials: 1 },
          'one publication must advance once',
        )
      },
    },
    {
      name: 'received midway failure publishes neither half and same operation retry succeeds',
      async run() {
        const input = await prepare('failure')
        const pause = joint.pause(input)
        joint.fault(input, 'before-publish')
        const pending = joint.received.commit(input)
        let source: DurableEvidence
        try {
          source = await pause.reached
        } finally {
          pause.release()
        }
        await refused(pending, 'unavailable', 'known midway failure must be unavailable')
        assert.deepEqual(
          await fixture.read(input, input.execution),
          [],
          'failure must not leave an entry',
        )
        assert.ok(
          'failure' in (await joint.materials.read({ ...input, source })),
          'failure must not leave readable material',
        )
        assert.deepEqual(
          await stats(input),
          { revision: 0, entries: 0, materials: 0 },
          'failure must not advance revision or leave either half',
        )
        assert.deepEqual(
          await ok(joint.received.query(input)),
          { kind: 'unknown' },
          'failure must not invent an exclusion',
        )
        const value = await committed(joint.received.commit(input))
        await assertVisible(input, value)
        assert.deepEqual(
          await committed(joint.received.commit(input)),
          value,
          'same operation retry must recall the complete original value',
        )
        assert.deepEqual(
          await stats(input),
          { revision: 1, entries: 1, materials: 1 },
          'retry must not advance revision again',
        )
      },
    },
    {
      name: 'received concurrent attempts of one operation publish only once',
      async run() {
        const input = await prepare('same-operation-concurrent')
        const pause = joint.pause(input)
        const pending = joint.received.commit(input)
        let first: ReceivedCommitValue
        try {
          await pause.reached
          first = await committed(joint.received.commit(input))
        } finally {
          pause.release()
        }
        assert.deepEqual(
          await committed(pending),
          first,
          'same operation concurrency must retain one original value',
        )
        await assertVisible(input, first)
        assert.deepEqual(
          await stats(input),
          { revision: 1, entries: 1, materials: 1 },
          'concurrent same operation must publish exactly once',
        )
      },
    },
    {
      name: 'received concurrent and cross-operation retries retain the complete original receipt',
      async run() {
        const input = await prepare('retry')
        const alias = { ...input, operation: operation('retry-alias') }
        const pause = joint.pause(input)
        const pending = joint.received.commit(input)
        let first: ReceivedCommitValue
        try {
          await pause.reached
          first = await committed(joint.received.commit(alias))
        } finally {
          pause.release()
        }
        assert.deepEqual(
          await committed(pending),
          first,
          'concurrent retry must recall the complete original receipt',
        )
        assert.deepEqual(
          await committed(joint.received.commit(input)),
          first,
          'same operation must retain the original value',
        )
        assert.deepEqual(
          await committed(joint.received.commit(alias)),
          first,
          'duplicate operation must not rewrite the original receipt',
        )
        for (const lookup of [input, alias]) {
          assert.deepEqual(
            await ok(joint.received.query(lookup)),
            { kind: 'committed', value: first },
            'each operation must query the original value',
          )
          assert.deepEqual(
            await ok(joint.journal.query(lookup)),
            { kind: 'committed', receipt: first.receipt },
            'each Journal query must retain original operation identity',
          )
        }
        assert.deepEqual(
          await stats(input),
          { revision: 1, entries: 1, materials: 1 },
          'duplicates must not mint revisions or materials',
        )
      },
    },
    {
      name: 'received response unknown is resolved through the original operation without rewriting',
      async run() {
        const input = await prepare('lost-response')
        joint.fault(input, 'after-publish')
        const failure = await refused(
          joint.received.commit(input),
          'commit-unknown',
          'lost response must remain commit-unknown',
        )
        assert.deepEqual(failure, { kind: 'commit-unknown', operation: input.operation })
        const result = await ok(joint.received.query(input))
        assert.ok(result.kind === 'committed', 'query must recover a published commit')
        await assertVisible(input, result.value)
        assert.deepEqual(
          await committed(joint.received.commit(input)),
          result.value,
          'lost response must not mint another saved result',
        )
        assert.deepEqual(await stats(input), { revision: 1, entries: 1, materials: 1 })
      },
    },
    {
      name: 'received unknown queries are read-only and authoritative exclusion blocks late publication',
      async run() {
        const input = await prepare('exclusion')
        const before = await stats(input)
        assert.deepEqual(await ok(joint.received.query(input)), { kind: 'unknown' })
        assert.deepEqual(
          await ok(joint.received.query(input)),
          { kind: 'unknown' },
          'query must not create an exclusion',
        )
        assert.deepEqual(await stats(input), before, 'query must not change committed state')
        const evidence = doubleEvidence('exclusion-owner', 'original-exclusion', '1')
        const pause = joint.pause(input)
        const pending = joint.received.commit(input)
        let source: DurableEvidence
        try {
          source = await pause.reached
          await joint.exclude(input, evidence)
          assert.deepEqual(await ok(joint.received.query(input)), { kind: 'excluded', evidence })
        } finally {
          pause.release()
        }
        assert.deepEqual(
          await ok(pending),
          { kind: 'excluded', evidence },
          'excluded late operation must never publish',
        )
        assert.deepEqual(
          await ok(joint.received.commit(input)),
          { kind: 'excluded', evidence },
          'excluded operation must not revive',
        )
        assert.ok(
          'failure' in (await joint.materials.read({ ...input, source })),
          'excluded operation must not leave material',
        )
        assert.deepEqual(await fixture.read(input, input.execution), [])
        assert.deepEqual(await stats(input), before)
      },
    },
    {
      name: 'received current qualification precedes cached results and exclusion evidence',
      async run() {
        const input = await prepare('qualification')
        const first = await committed(joint.received.commit(input))
        for (const status of ['denied', 'unavailable'] as const) {
          joint.qualify(input, input.execution, status)
          await refused(
            joint.received.commit(input),
            status,
            'cached commit must recheck qualification',
          )
          await refused(
            joint.received.query(input),
            status,
            'cached query must recheck qualification',
          )
          await refused(
            joint.journal.query(input),
            status,
            'Journal query must recheck qualification',
          )
        }
        joint.qualify(input, input.execution, 'allowed')
        assert.deepEqual(await committed(joint.received.commit(input)), first)
        const excluded = await prepare('excluded-qualification')
        await joint.exclude(excluded, doubleEvidence('exclusion', 'qualified', '1'))
        joint.qualify(excluded, excluded.execution, 'denied')
        await refused(
          joint.received.query(excluded),
          'denied',
          'exclusion evidence must not bypass qualification',
        )
      },
    },
    {
      name: 'received tenants and frozen bindings cannot be replaced by caller claims',
      async run() {
        const input = await prepare('tenant')
        const foreign = { ...input, ...otherAccess }
        const missing = {
          ...foreign,
          execution: decoded(decodeAgentExecutionId('joint-does-not-exist')),
        }
        const denied = await refused(
          joint.received.commit(foreign),
          'denied',
          'foreign tenant must not receive cached state',
        )
        assert.deepEqual(
          await refused(
            joint.received.commit(missing),
            'denied',
            'missing execution must be denied',
          ),
          denied,
        )
        await refused(
          joint.received.query(foreign),
          'denied',
          'foreign tenant query must be denied',
        )
        const unbound = {
          ...input,
          entry: {
            ...input.entry,
            delivery: sampleReceivedModelResult(access.tenant, 'unbound').delivery,
          },
        }
        await refused(
          joint.received.commit(unbound),
          'denied',
          'self-declared consumer is not a frozen binding',
        )
        const foreignCall = {
          ...input,
          entry: {
            ...input.entry,
            delivery: sampleReceivedModelResult(otherAccess.tenant, 'foreign-call').delivery,
          },
        }
        await refused(
          joint.received.commit(foreignCall),
          'denied',
          'producer call tenant must match access',
        )
        const value = await committed(joint.received.commit(input))
        for (const changed of [
          {
            ...input,
            entry: { ...input.entry, consumer: { ...input.entry.consumer, owner: 'other' } },
          },
          {
            ...input,
            entry: {
              ...input.entry,
              consumption: decoded(decodeConsumptionId('other-consumption')),
            },
          },
          {
            ...input,
            entry: {
              ...input.entry,
              delivery: sampleReceivedModelResult(access.tenant, 'joint-tenant', '99').delivery,
            },
          },
          { ...input, material: joint.material('changed-payload') },
        ]) {
          await refused(
            joint.received.commit(changed),
            'conflict',
            'same operation with changed complete semantics must conflict',
          )
          await refused(
            joint.received.commit({ ...changed, operation: operation('changed-alias') }),
            'conflict',
            'same delivery with changed complete semantics must conflict',
          )
        }
        assert.deepEqual(await committed(joint.received.commit(input)), value)
        assert.deepEqual(await stats(input), { revision: 1, entries: 1, materials: 1 })
      },
    },
    {
      name: 'received same execution and operation text remain separate across tenants',
      async run() {
        const mine = await prepare('twins')
        const theirs = await prepare('twins', otherAccess)
        const first = await committed(joint.received.commit(mine))
        const second = await committed(joint.received.commit(theirs))
        await assertVisible(mine, first)
        await assertVisible(theirs, second)
        assert.notDeepEqual(
          first.entry.material,
          second.entry.material,
          'tenant identity must separate material addresses',
        )
        assert.ok(
          'failure' in
            (await joint.materials.read({ ...otherAccess, source: first.entry.material })),
          'material read must not cross tenants',
        )
        assert.deepEqual(await stats(mine), { revision: 1, entries: 1, materials: 1 })
        assert.deepEqual(await stats(theirs), { revision: 1, entries: 1, materials: 1 })
      },
    },
    {
      name: 'received malformed fields are rejected without publishing state',
      async run() {
        const input = await prepare('invalid')
        const malformed: readonly [unknown, string][] = [
          [{ ...input, tenant: undefined }, 'tenant'],
          [{ ...input, execution: '' }, 'execution'],
          [{ ...input, operation: '' }, 'operation'],
          [
            {
              ...input,
              entry: { ...input.entry, consumer: { ...input.entry.consumer, owner: '' } },
            },
            'entry.consumer.owner',
          ],
          [{ ...input, entry: { ...input.entry, consumption: '' } }, 'entry.consumption'],
          [
            { ...input, material: { kind: 'facts', schema: {}, value: {} } },
            'material.schema.owner',
          ],
        ]
        for (const [value, field] of malformed) {
          const failure = await refused(
            joint.received.commit(value as ReceivedCommitInput<P, B>),
            'invalid',
            'malformed input must be invalid',
          )
          assert.ok(failure.kind === 'invalid')
          assert.equal(failure.field, field, 'invalid must identify the actual input field')
        }
        assert.deepEqual(await fixture.read(input, input.execution), [])
        assert.deepEqual(await stats(input), { revision: 0, entries: 0, materials: 0 })
      },
    },
    {
      name: 'received custody remains available after execution ended and attachment replacement',
      async run() {
        const input = await prepare('ended')
        await fixture.supersede(input, input.execution)
        await fixture.end(input, input.execution)
        const value = await committed(joint.received.commit(input))
        await assertVisible(input, value)
        assert.deepEqual(await ok(joint.received.query(input)), { kind: 'committed', value })
      },
    },
    {
      name: 'received new commits coexist with old record and share all operation aliases',
      async run() {
        const input = await prepare('new-old')
        const value = await committed(joint.received.commit(input))
        for (const id of [input.operation, operation('old-alias')]) {
          const alias = { ...input, operation: id }
          assert.deepEqual(
            await ok(fixture.entries.record({ ...alias, authority: null, entry: value.entry })),
            value.receipt,
            'old record must retain the original command receipt',
          )
          assert.deepEqual(
            await ok(joint.received.query(alias)),
            { kind: 'committed', value },
            'old record alias must recognize the same rich result',
          )
          assert.deepEqual(await ok(joint.journal.query(alias)), {
            kind: 'committed',
            receipt: value.receipt,
          })
        }
        assert.deepEqual(await stats(input), { revision: 1, entries: 1, materials: 1 })
      },
    },
    {
      name: 'received legacy records require original material and saved without repairing history',
      async run() {
        const absent = await prepare('legacy-absent')
        const missingEntry = {
          ...absent.entry,
          material: doubleEvidence('absent', 'old-material', '1'),
        }
        const oldReceipt = await ok(
          fixture.entries.record({ ...absent, authority: null, entry: missingEntry }),
        )
        await refused(
          joint.received.commit(absent),
          'unavailable',
          'legacy material absence must be explicit',
        )
        await refused(
          joint.received.query(absent),
          'unsupported',
          'legacy query without rich evidence must be unsupported',
        )
        assert.deepEqual(await ok(joint.journal.query(absent)), {
          kind: 'committed',
          receipt: oldReceipt,
        })
        assert.deepEqual(
          await fixture.read(absent, absent.execution),
          [missingEntry],
          'missing legacy material must not be backfilled',
        )
        const input = await prepare('legacy')
        const source = await ok(
          joint.materials.preserve({
            ...input,
            identity: 'legacy',
            consumer: input.entry.consumer,
            value: input.material,
          }),
        )
        const entry = { ...input.entry, material: source }
        const receipt = await ok(fixture.entries.record({ ...input, authority: null, entry }))
        await refused(
          joint.received.commit(input),
          'unsupported',
          'legacy saved must not be fabricated',
        )
        await refused(
          joint.received.query(input),
          'unsupported',
          'legacy query must not pretend missing saved is uncommitted',
        )
        const saved = doubleEvidence(
          input.entry.consumer.owner,
          'original-saved-from-provider',
          '1',
        )
        joint.retainSaved(input, saved)
        const value = { receipt, entry, saved }
        assert.deepEqual(
          await committed(
            joint.received.commit({ ...input, operation: operation('legacy-alias') }),
          ),
          value,
          'legacy recognition must return original evidence',
        )
        assert.deepEqual(await committed(joint.received.commit(input)), value)
        joint.loseMaterial(source)
        const before = await stats(input)
        await refused(
          joint.received.commit({ ...input, operation: operation('legacy-missing') }),
          'unavailable',
          'legacy missing material must not be repaired by a retry',
        )
        await refused(
          joint.received.query(input),
          'unavailable',
          'known rich result with unreadable material must be unavailable',
        )
        assert.deepEqual(
          await ok(joint.journal.query(input)),
          { kind: 'committed', receipt },
          'missing material must not erase old command identity',
        )
        assert.deepEqual(await fixture.read(input, input.execution), [entry])
        assert.deepEqual(
          await stats(input),
          before,
          'failed legacy recognition must not append or advance',
        )
      },
    },
    {
      name: 'received legacy recognition cannot adopt another tenant material source',
      async run() {
        const input = await prepare('foreign-legacy')
        const foreign = await prepare('foreign-legacy-source', otherAccess)
        const source = await ok(
          joint.materials.preserve({
            ...foreign,
            identity: 'foreign-legacy',
            consumer: foreign.entry.consumer,
            value: input.material,
          }),
        )
        const entry = { ...input.entry, material: source }
        const receipt = await ok(fixture.entries.record({ ...input, authority: null, entry }))
        joint.retainSaved(input, doubleEvidence(input.entry.consumer.owner, 'legacy-saved', '1'))
        await refused(
          joint.received.commit(input),
          'unavailable',
          'legacy foreign material must not be recognized as readable custody',
        )
        await refused(
          joint.received.query(input),
          'unavailable',
          'rich query must not expose foreign material custody',
        )
        assert.ok(
          'failure' in (await joint.materials.read({ ...input, source })),
          'foreign source must remain unreadable',
        )
        assert.deepEqual(
          await ok(joint.journal.query(input)),
          { kind: 'committed', receipt },
          'original legacy receipt must remain queryable',
        )
        assert.deepEqual(
          await stats(input),
          { revision: 1, entries: 1, materials: 0 },
          'failed foreign recognition must not repair or append',
        )
      },
    },
    {
      name: 'received operation conflict and exclusion take priority over delivery recognition',
      async run() {
        const input = await prepare('priority')
        const authority = await fixture.supersede(input, input.execution)
        const occupied = { ...input, operation: operation('occupied') }
        await ok(
          fixture.entries.record({ ...occupied, authority, entry: sampleStartFence('occupied') }),
        )
        await refused(
          joint.received.query(occupied),
          'unsupported',
          'non-receiving operation must not appear unknown',
        )
        await refused(
          joint.received.commit(occupied),
          'conflict',
          'another command owns this operation',
        )
        const excluded = { ...input, operation: operation('excluded-alias') }
        const evidence = doubleEvidence('exclusion', 'priority', '1')
        await joint.exclude(excluded, evidence)
        await committed(joint.received.commit(input))
        await refused(
          joint.received.commit(occupied),
          'conflict',
          'delivery recognition must not override operation conflict',
        )
        assert.deepEqual(
          await ok(joint.received.commit(excluded)),
          { kind: 'excluded', evidence },
          'delivery recognition must not override operation exclusion',
        )
      },
    },
    {
      // Red when commit writes the entry without its `entry` event, allocates the event under
      // another cause or another attachment, or gives it a sequence out of order.
      name: 'received commit projects the entry as one entry event of the same commit',
      async run() {
        const input = await prepare('entry-event')
        const latest = await fixture.supersede(input, input.execution)
        const before = await events(input)
        const value = await committed(joint.received.commit(input))
        const after = await events(input)
        assert.equal(after.length, before.length + 1, 'one commit must add exactly one event')
        const event = after.at(-1)
        assert.deepEqual(event?.body, { kind: 'entry', entry: value.entry })
        assert.deepEqual(event?.cause, value.receipt.evidence, 'cause must be the commit evidence')
        assert.equal(event?.execution, input.execution)
        assert.equal(
          event?.executionAttachment,
          latest.executionAttachment,
          'the event must carry the latest established attachment',
        )
        const previous = before.at(-1)
        if (previous !== undefined)
          assert.equal(Number(event?.sequence), Number(previous.sequence) + 1)
      },
    },
    {
      // Red when a replay of the operation or another operation of the same delivery allocates
      // a second event.
      name: 'received commit replays and operation aliases allocate no second event',
      async run() {
        const input = await prepare('replay-event')
        const value = await committed(joint.received.commit(input))
        const after = await events(input)
        assert.deepEqual(await committed(joint.received.commit(input)), value)
        assert.deepEqual(
          await committed(joint.received.commit({ ...input, operation: operation('alias-event') })),
          value,
        )
        assert.deepEqual(await events(input), after, 'a replay must allocate no event')
      },
    },
    {
      // Red when the entry written through one entry port gets a second event when the other
      // port recognizes the same delivery.
      name: 'received record then commit and commit then record allocate one event each',
      async run() {
        const legacy = await prepare('record-then-commit')
        const source = await ok(
          joint.materials.preserve({
            ...legacy,
            identity: 'record-then-commit',
            consumer: legacy.entry.consumer,
            value: legacy.material,
          }),
        )
        const entry = { ...legacy.entry, material: source }
        const before = await events(legacy)
        const receipt = await ok(fixture.entries.record({ ...legacy, authority: null, entry }))
        const recorded = await events(legacy)
        assert.equal(recorded.length, before.length + 1, 'record must add one event')
        assert.deepEqual(recorded.at(-1)?.cause, receipt.evidence)
        joint.retainSaved(legacy, doubleEvidence(entry.consumer.owner, 'saved-after-record', '1'))
        await committed(joint.received.commit({ ...legacy, operation: operation('after-record') }))
        assert.deepEqual(
          await events(legacy),
          recorded,
          'commit recognizing a recorded delivery must allocate no event',
        )
        const fresh = await prepare('commit-then-record')
        const value = await committed(joint.received.commit(fresh))
        const committedEvents = await events(fresh)
        assert.deepEqual(
          await ok(
            fixture.entries.record({
              ...fresh,
              operation: operation('after-commit'),
              authority: null,
              entry: value.entry,
            }),
          ),
          value.receipt,
        )
        assert.deepEqual(
          await events(fresh),
          committedEvents,
          'record recognizing a committed delivery must allocate no event',
        )
      },
    },
    {
      // Red when commit appends an entry event after the end; ended is the last event.
      name: 'received commit after the end writes the entry without an event',
      async run() {
        const input = await prepare('ended-event')
        await fixture.end(input, input.execution)
        const before = await events(input)
        const value = await committed(joint.received.commit(input))
        assert.deepEqual(await fixture.read(input, input.execution), [value.entry])
        assert.deepEqual(await events(input), before, 'no event may follow the end')
      },
    },
    {
      // Red when a commit whose reply is lost after publication holds the entry without its
      // event, or when a failure before publication leaves either of them.
      name: 'received lost reply keeps entry and event together and a failure before publication leaves neither',
      async run() {
        const lost = await prepare('lost-reply-event')
        const before = await events(lost)
        joint.fault(lost, 'after-publish')
        await refused(joint.received.commit(lost), 'commit-unknown', 'lost reply')
        const result = await ok(joint.received.query(lost))
        assert.ok(result.kind === 'committed', 'query must recover the published commit')
        assert.deepEqual(await fixture.read(lost, lost.execution), [result.value.entry])
        const after = await events(lost)
        assert.equal(after.length, before.length + 1, 'the published commit holds one event')
        assert.deepEqual(after.at(-1)?.body, { kind: 'entry', entry: result.value.entry })
        assert.deepEqual(after.at(-1)?.cause, result.value.receipt.evidence)
        const failed = await prepare('failed-event')
        const untouched = await events(failed)
        joint.fault(failed, 'before-publish')
        await refused(joint.received.commit(failed), 'unavailable', 'failure before publication')
        assert.deepEqual(await fixture.read(failed, failed.execution), [])
        assert.deepEqual(await events(failed), untouched, 'a failed commit allocates no event')
      },
    },
    {
      // Red when a denied or conflicting commit allocates an event.
      name: 'received denied and conflicting commits allocate no event',
      async run() {
        const input = await prepare('refused-event')
        const before = await events(input)
        joint.qualify(input, input.execution, 'denied')
        await refused(joint.received.commit(input), 'denied', 'denied qualification')
        joint.qualify(input, input.execution, 'allowed')
        await refused(
          joint.received.commit({ ...input, material: joint.material('changed-event') }),
          'conflict',
          'changed material against the frozen binding',
        )
        assert.deepEqual(await fixture.read(input, input.execution), [])
        assert.deepEqual(await events(input), before, 'a refused commit allocates no event')
      },
    },
  ]
}
