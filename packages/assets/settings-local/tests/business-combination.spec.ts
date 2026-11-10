import { afterEach, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { openBusinessWorld, seedGate, seedState, sourceRoot, stored } from './business-world.ts'
import { openRecoveryWorld } from './recovery-world.ts'
import { reply } from './preparation-world.ts'
import { definition, definitionRef, secretDefinition, secretDefinitionRef } from './world.ts'
import { digest } from '../src/encoding.ts'
import type { CommitCurrent, CommitMaterial } from '../src/commit-current.ts'
import { businessPlanSchema } from '../src/finalization-schema.ts'
import { allocation } from './intent-world.ts'
import { recoveryRequest } from './recovery-world.ts'

const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0)) await fn()
})
async function open(options: Parameters<typeof openBusinessWorld>[0] = {}, prepare = true) {
  const s = await openBusinessWorld(options, prepare)
  close.push(() => s.world.close())
  return s
}
function available(current: CommitCurrent): CommitMaterial {
  if (current.observation.kind !== 'available') throw new Error('Fixture material is unavailable')
  return current.observation.material
}

it('commits the value, receipt, root and terminal together and recognizes the exact SQL retry after reopen', async () => {
  const s = await open(),
    key = randomUUID()
  expect(reply(await s.world.commit(s.commitCurrent, { key }))).toMatchObject({
    result: {
      status: { state: 'committed', result: { revision: 1, changed: true } },
      attempt: null,
    },
  })
  expect(stored(s.world.root)).toMatchObject({
    state: {
      state: {
        revision: 1,
        sources: [
          { id: 'tenant', values: [{ itemId: 'enabled', value: { kind: 'value', value: true } }] },
        ],
      },
    },
    operations: 1,
    changes: 1,
    terminals: 1,
  })
  await s.world.close()
  const reopened = await openRecoveryWorld(s.world.root, s.input.identity.domain)
  close.push(() => reopened.close())
  expect(reply(await reopened.commit(s.commitCurrent, { key }))).toMatchObject({
    result: { status: { state: 'committed' } },
  })
  expect(stored(s.world.root).operations).toBe(1)
})

it('records a no-change result without inventing a value revision', async () => {
  const s = await open({
    configure(input) {
      if (input.intent.kind === 'change') input.intent.command.action = { kind: 'clear' }
    },
  })
  expect(reply(await s.world.commit(s.commitCurrent))).toMatchObject({
    result: { status: { result: { revision: 0, changed: false } } },
  })
  expect(stored(s.world.root)).toMatchObject({ operations: 1, changes: 0, terminals: 1 })
})

it('persists revision failure before treating a changed basis as a retryable attempt', async () => {
  const s = await open({
    initialize(root, input) {
      seedState(root, input, 1)
    },
  })
  available(s.commitCurrent).basis.valueRevision = 1
  expect(reply(await s.world.commit(s.commitCurrent))).toMatchObject({
    result: { status: { state: 'aborted', reason: 'revision_conflict' }, attempt: null },
  })
  expect(stored(s.world.root)).toMatchObject({
    state: { state: { revision: 1 } },
    operations: 0,
    changes: 0,
    terminals: 1,
  })
})

it.each(['forbidden', 'definition_changed', 'incompatible'] as const)(
  'persists confirmed business refusal %s',
  async reason => {
    const s = await open()
    s.commitCurrent.observation = { kind: 'refused', reason }
    expect(reply(await s.world.commit(s.commitCurrent))).toMatchObject({
      result: { status: { state: 'aborted', reason } },
    })
    expect(stored(s.world.root)).toMatchObject({ state: null, operations: 0, terminals: 1 })
  },
)

it('checks actual definition and grant changes before mere basis drift', async () => {
  const s = await open()
  const material = available(s.commitCurrent)
  material.definition = { ...definition, version: '2' }
  material.basis.definitionRef = {
    ...definitionRef,
    version: '2',
    digest: digest(material.definition),
  }
  expect(reply(await s.world.commit(s.commitCurrent))).toMatchObject({
    result: { status: { state: 'aborted', reason: 'definition_changed' } },
  })
  const t = await open()
  available(t.commitCurrent).grants = []
  expect(reply(await t.world.commit(t.commitCurrent))).toMatchObject({
    result: { status: { state: 'aborted', reason: 'forbidden' } },
  })
})

it('honors an upper-source lock in the actual stored value state', async () => {
  const s = await open({
    configure(input) {
      input.plan.sources.unshift({
        sourceId: 'organization',
        ownerRef: 'owner',
        scope: { kind: 'organization', subjectRef: 'org' },
        authorityRevision: '1',
      })
    },
    initialize(root, input) {
      seedState(root, input, 0, true)
    },
  })
  expect(reply(await s.world.commit(s.commitCurrent))).toMatchObject({
    result: { status: { state: 'aborted', reason: 'locked' } },
  })
  expect(stored(s.world.root).changes).toBe(0)
})

it('seals only the ordinary attempt when the comparison basis changes', async () => {
  const s = await open()
  available(s.commitCurrent).basis.declaration.revision = '2'
  expect(reply(await s.world.commit(s.commitCurrent))).toMatchObject({
    result: { status: { state: 'open' }, attempt: null },
  })
  expect(await s.world.read(s.request)).toMatchObject({
    output: { terminal: { state: 'aborted' } },
  })
  expect(stored(s.world.root)).toMatchObject({ state: null, operations: 0, terminals: 1 })
})

it.each(['apply', 'drift', 'refuse'] as const)(
  'finishes the exact source gate with its root for %s',
  async mode => {
    const s = await open({ configure: sourceRoot, initialize: seedGate })
    if (mode === 'drift') available(s.commitCurrent).basis.declaration.revision = '2'
    if (mode === 'refuse') s.commitCurrent.observation = { kind: 'refused', reason: 'forbidden' }
    expect((await s.world.commit(s.commitCurrent)).kind).toBe('committed')
    expect(await s.world.read(s.request)).toMatchObject({
      output: {
        root: {
          status:
            mode === 'apply'
              ? { state: 'committed' }
              : { state: 'aborted', reason: mode === 'drift' ? 'sealed' : 'forbidden' },
          attempt: null,
        },
        gate: { pending: null, held: 0 },
        terminal: { state: mode === 'apply' ? 'committed' : 'aborted' },
      },
    })
  },
)

it('cannot commit through outstanding source holds or finish a different source root', async () => {
  for (const mode of ['held', 'foreign'] as const) {
    const s = await open({
      configure: sourceRoot,
      initialize(root, input) {
        seedGate(root, input, mode === 'held', mode === 'foreign')
      },
    })
    expect((await s.world.commit(s.commitCurrent)).kind).toBe('rolled_back')
    expect(await s.world.read(s.request)).toMatchObject({
      output: {
        root: { status: { state: 'open' }, attempt: { status: { state: 'prepared' } } },
        terminal: null,
      },
    })
    expect(stored(s.world.root)).toMatchObject({ state: null, operations: 0 })
  }
})

it('checks the ordinary target gate and permits aborted source completion without dropping held obligations', async () => {
  const ordinary = await open({
    initialize(root, input) {
      seedGate(root, input, false, true)
    },
  })
  expect((await ordinary.world.commit(ordinary.commitCurrent)).kind).toBe('rolled_back')
  expect(await ordinary.world.read(ordinary.request)).toMatchObject({
    output: { terminal: null, root: { attempt: { status: { state: 'prepared' } } } },
  })
  const source = await open({
    configure: sourceRoot,
    initialize(root, input) {
      seedGate(root, input, true)
    },
  })
  source.commitCurrent.observation = { kind: 'refused', reason: 'forbidden' }
  expect((await source.world.commit(source.commitCurrent)).kind).toBe('committed')
  expect(await source.world.read(source.request)).toMatchObject({
    output: {
      root: { status: { state: 'aborted', reason: 'forbidden' } },
      gate: { pending: null, held: 1 },
    },
  })
})

it('does not turn unavailable input, missing custody or an unprepared attempt into a business abort', async () => {
  const s = await open()
  expect(
    (await s.world.commit({ ...s.commitCurrent, observation: { kind: 'unavailable' } })).kind,
  ).toBe('rolled_back')
  expect((await s.world.commit(s.commitCurrent, { omitCurrent: true })).kind).toBe(
    'rejected_before_accept',
  )
  expect(
    (
      await s.world.commit(s.commitCurrent, {
        binding: { ...s.current.binding, commandDigest: 'f'.repeat(64) },
      })
    ).kind,
  ).toBe('rolled_back')
  expect(await s.world.read(s.request)).toMatchObject({
    output: { root: { status: { state: 'open' } }, terminal: null },
  })
  const t = await open({ held: false }, false)
  expect((await t.world.commit(t.commitCurrent)).kind).toBe('rolled_back')
  expect(await t.world.read(t.request)).toMatchObject({
    output: { root: { attempt: { status: { state: 'preparing' } } }, terminal: null },
  })
})

it('rolls every business effect and source completion back together', async () => {
  const s = await open({ configure: sourceRoot, initialize: seedGate })
  expect((await s.world.commit(s.commitCurrent, { rollback: true })).kind).toBe('rolled_back')
  expect(await s.world.read(s.request)).toMatchObject({
    output: {
      root: { status: { state: 'open' }, attempt: { status: { state: 'prepared' } } },
      gate: { pending: { identity: s.input.identity } },
      terminal: null,
    },
  })
  expect(stored(s.world.root)).toMatchObject({
    state: null,
    operations: 0,
    changes: 0,
    terminals: 0,
  })
  expect((await s.world.commit(s.commitCurrent)).kind).toBe('committed')
})

it.each([true, false])(
  'orders commit and seal with no revival, commit first = %s',
  async commitFirst => {
    const s = await open()
    if (commitFirst) {
      expect((await s.world.commit(s.commitCurrent)).kind).toBe('committed')
      expect((await s.world.run(s.request)).kind).toBe('committed')
      expect(await s.world.read(s.request)).toMatchObject({
        output: { root: { status: { state: 'committed' } }, terminal: { state: 'committed' } },
      })
    } else {
      expect((await s.world.run(s.request)).kind).toBe('committed')
      expect((await s.world.commit(s.commitCurrent)).kind).toBe('rolled_back')
      expect(stored(s.world.root)).toMatchObject({ state: null, operations: 0 })
    }
  },
)

it('rebases through the prepared business transaction', async () => {
  const next = { ...definition, version: '2' },
    nextRef = { ...definitionRef, version: '2', digest: digest(next) }
  const s = await open({
    configure(input) {
      const c = input.intent.command
      input.intent = {
        kind: 'rebase',
        command: {
          protocol: 'settings-rebase/1',
          requestId: c.requestId,
          operationId: c.operationId,
          target: c.target,
          from: definitionRef,
          to: nextRef,
          expectedRevision: 0,
          assignments: [],
        },
      }
      input.plan.definitionRef = nextRef
    },
    initialize(root, input) {
      seedState(root, input, 0)
    },
  })
  available(s.commitCurrent).definition = next
  expect(reply(await s.world.commit(s.commitCurrent))).toMatchObject({
    result: { status: { state: 'committed', result: { revision: 1 } } },
  })
  expect(stored(s.world.root)).toMatchObject({ state: { definitionRef: nextRef }, changes: 1 })
})

it('keeps secrets out of the ordinary assignment store', async () => {
  const s = await open({
    configure(input) {
      if (input.intent.kind !== 'change') throw new Error('Fixture change required')
      input.intent.command.definitionRef = secretDefinitionRef
      input.intent.command.action = { kind: 'set', value: 'private-fixture-value' }
      input.plan.definitionRef = secretDefinitionRef
    },
  })
  available(s.commitCurrent).definition = secretDefinition
  expect((await s.world.commit(s.commitCurrent)).kind).toBe('rolled_back')
  expect(stored(s.world.root)).toMatchObject({
    state: null,
    operations: 0,
    changes: 0,
    terminals: 0,
  })
})

it('keeps one outcome under concurrent commit and seal', async () => {
  const s = await open()
  const [committed, sealed] = await Promise.all([
    s.world.commit(s.commitCurrent),
    s.world.run(s.request),
  ])
  expect(['committed', 'rolled_back']).toContain(committed.kind)
  expect(sealed.kind).toBe('committed')
  const success = committed.kind === 'committed'
  expect(await s.world.read(s.request)).toMatchObject({
    output: {
      root: { status: { state: success ? 'committed' : 'open' }, attempt: null },
      terminal: { state: success ? 'committed' : 'aborted' },
    },
  })
  expect(stored(s.world.root).operations).toBe(success ? 1 : 0)
})

it('rejects plans whose business, terminal and source outcomes disagree', () => {
  const input = allocation(),
    binding = recoveryRequest(input).binding
  const plan = {
    request: { kind: 'commit', binding },
    effect: 'business',
    terminal: { kind: 'attempt', binding, state: 'aborted' },
    source: { kind: 'none' },
    outcome: { kind: 'abort-attempt' },
  }
  expect(businessPlanSchema.safeParse(plan).success).toBe(true)
  for (const changed of [
    { ...plan, terminal: { ...plan.terminal, state: 'committed' } },
    { ...plan, terminal: { ...plan.terminal, binding: { ...binding, attemptId: 'different' } } },
    {
      ...plan,
      source: {
        kind: 'finish',
        update: {
          source: { domain: binding.identity.domain, target: binding.identity.operation.target },
          identity: binding.identity,
          commandDigest: binding.commandDigest,
        },
        outcome: 'committed',
      },
    },
    {
      ...plan,
      source: {
        kind: 'finish',
        update: {
          source: { domain: binding.identity.domain, target: binding.identity.operation.target },
          identity: {
            ...binding.identity,
            operation: { ...binding.identity.operation, operationId: 'another-root' },
          },
          commandDigest: binding.commandDigest,
        },
        outcome: 'aborted',
      },
    },
  ])
    expect(businessPlanSchema.safeParse(changed).success).toBe(false)
})
