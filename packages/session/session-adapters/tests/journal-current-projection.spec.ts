import { expect, it } from 'vitest'
import { decodeAgentExecutionId, decodeInputId, decodeStepId } from '@omne-harness/agent-contract'
import {
  currentChanges,
  currentExecution,
  currentRows,
  executionFromRows,
  selectCurrentExecution,
} from '../src/journal/current.ts'
import { emptySessionView, fold, type PublishedBatch } from '../src/journal/index.ts'
import { evidence, ok, operation, checkpoint } from './fixtures/common-journal.ts'
import { scene } from './fixtures/journal-facts.ts'
import { random } from './fixtures/property.ts'

it('keeps an unresolved original call when the cursor moves to another step', () => {
  const source = scene(random(42), { executions: 1, rounds: 1, finish: false })
  let session = emptySessionView()
  for (const batch of source.log) session = fold(session, batch)
  const original = session.executions.values().next().value!
  const intent = original.intents.values().next().value!
  const view = {
    ...original,
    cursor: { ...original.cursor, step: ok(decodeStepId('another-step')) },
    intents: new Map([[intent.action, { ...intent, settlement: null }]]),
    results: new Map(),
  }
  const selected = selectCurrentExecution(view, { ...checkpoint(), step: view.cursor.step })
  expect(selected.intents.has(intent.action)).toBe(true)
})

it('keeps separately valid result-stage evidence within the projection row bound', () => {
  const source = scene(random(42), { executions: 1, rounds: 1, finish: false })
  const original = source.log
    .flatMap(batch => batch.facts)
    .find(fact => fact.kind === 'result.handled')
  if (original?.kind !== 'result.handled') throw new Error('a result-stage fixture is required')
  const execution = ok(decodeAgentExecutionId('large-result-stages'))
  let session = emptySessionView()
  for (const [index, stage] of (
    ['custody', 'recorded', 'processed', 'released'] as const
  ).entries()) {
    const fact = {
      ...original,
      stage,
      evidence: {
        owner: 'result-owner',
        record: `${stage}/${'r'.repeat(2900)}`,
        revision: '1',
        digest: `sha256:${'a'.repeat(64)}`,
      },
    }
    expect(Buffer.byteLength(JSON.stringify(fact))).toBeLessThanOrEqual(4096)
    session = fold(session, {
      execution,
      pub: index + 1,
      envelope: { op: operation(stage), digest: stage, rev: index + 1, gen: '1', kinds: [] },
      facts: [fact],
    })
    const current = currentExecution(session.executions.get(execution)!)
    const rows = [...currentRows(current)].map(([key, value]) => ({ key, value }))
    expect(Math.max(...rows.map(row => Buffer.byteLength(row.value)))).toBeLessThanOrEqual(4096)
    expect(executionFromRows(execution, rows)).toEqual(current)
  }
})

it('retires an input by its original key without reusing that key for the next input', () => {
  const execution = ok(decodeAgentExecutionId('input-projection'))
  let session = emptySessionView()
  for (let i = 1; i <= 2; i += 1)
    session = fold(session, {
      execution,
      pub: i,
      envelope: { op: operation(`input-${i}`), digest: `input:${i}`, rev: i, gen: '1', kinds: [] },
      facts: [
        {
          kind: 'input.accepted',
          input: ok(decodeInputId(`input-${i}`)),
          entry: operation(`entry-${i}`),
          message: { digest: `input-body-${i}`, size: 20 },
          source: null,
          priority: 'ordinary',
          watermark: evidence(`watermark-${i}`),
        },
      ],
    })
  const before = session.executions.get(execution)!
  const rows = [...currentRows(currentExecution(before))]
  const firstKey = rows.find(([, value]) => value.includes('input-body-1'))![0]
  const secondKey = rows.find(([, value]) => value.includes('input-body-2'))![0]
  const after = { ...before, inputs: before.inputs.slice(1) }
  expect(currentChanges(before, after)).toContainEqual({
    key: firstKey,
    value: null,
    active: false,
  })
  expect(currentRows(currentExecution(after)).has(secondKey)).toBe(true)
  expect(
    executionFromRows(
      execution,
      [...currentRows(currentExecution(after))].map(([key, value]) => ({ key, value })),
    ),
  ).toEqual(currentExecution(after))
  const retired = currentChanges(before, before, currentExecution(after))
  expect(retired.find(row => row.key === firstKey)).toMatchObject({ active: false })
  expect(retired.find(row => row.key === firstKey)?.value).toContain('input-body-1')
  const kept = retired.find(row => row.key === secondKey)
  expect(kept).toMatchObject({ active: true })
  expect(kept?.value).toContain('"index":0')
})

it('keeps a fixed recovery projection and bounded deltas as archived output grows', () => {
  const execution = ok(decodeAgentExecutionId('current-projection'))
  let view = emptySessionView()
  const rows = new Map<string, string>()
  const sizes: number[] = []
  for (let i = 1; i <= 100; i += 1) {
    const batch: PublishedBatch = {
      execution,
      pub: i,
      envelope: {
        op: operation(`message-${i}`),
        digest: `commit:${i}`,
        rev: i,
        gen: '1',
        kinds: [],
      },
      facts: [
        {
          kind: 'message.published',
          step: ok(decodeStepId(`step-${i}`)),
          message: { digest: `body-${i}`, size: 1000 },
          source: evidence(`source-${i}`),
        },
      ],
    }
    const prior = view.executions.get(execution)
    view = fold(view, batch)
    const own = view.executions.get(execution)!
    const changes = currentChanges(prior, own)
    if (i > 1) expect(changes.length).toBeLessThanOrEqual(8)
    for (const row of changes) {
      if (row.value === null) rows.delete(row.key)
      else rows.set(row.key, row.value)
    }
    const restored = executionFromRows(
      execution,
      [...rows].map(([key, value]) => ({ key, value })),
    )
    expect(restored).toEqual(currentExecution(own))
    expect(restored.emitted).toBe(i)
    expect(restored).not.toHaveProperty('events')
    expect(restored).not.toHaveProperty('ops')
    sizes.push(rows.size)
    view = {
      ...view,
      executions: new Map([
        [execution, { ...restored, events: [], ops: new Map(), reached: new Map() }],
      ]),
      ops: new Map(),
    }
  }
  expect(new Set(sizes).size).toBe(1)
  expect(currentRows(view.executions.get(execution)!).size).toBe(sizes[0])
})

it('keeps the original candidate identity when an older candidate exits current work', () => {
  const execution = ok(decodeAgentExecutionId('candidate-projection'))
  let session = emptySessionView()
  for (let i = 1; i <= 2; i += 1)
    session = fold(session, {
      execution,
      pub: i,
      envelope: {
        op: operation(`candidate-${i}`),
        digest: `candidate:${i}`,
        rev: i,
        gen: '1',
        kinds: [],
      },
      facts: [
        {
          kind: 'finish.candidate',
          candidate: operation(`candidate-${i}`),
          claim: {
            origin: evidence('origin'),
            conclusion: { kind: 'complete' },
            failure: null,
            inputWatermark: evidence('watermark'),
            conditions: evidence('conditions'),
          },
          cursor: { digest: `cursor-${i}`, size: 10 },
          path: { digest: `path-${i}`, size: 10 },
          route: evidence(`route-${i}`),
          supersedes: i === 1 ? null : operation('candidate-1'),
        },
      ],
    })
  const before = session.executions.get(execution)!
  const candidates = [...currentRows(currentExecution(before))].filter(([key]) =>
    key.startsWith('["finish","candidates",'),
  )
  const firstKey = candidates.find(([, value]) => value.includes('cursor-1'))![0]
  const secondKey = candidates.find(([, value]) => value.includes('cursor-2'))![0]
  const selected = currentExecution({
    ...before,
    finish: { ...before.finish, candidates: before.finish.candidates.slice(1) },
  })
  const changes = currentChanges(before, before, selected)
  expect(changes.find(row => row.key === firstKey)).toMatchObject({ active: false })
  expect(currentRows(selected).has(secondKey)).toBe(true)
  expect(
    executionFromRows(
      execution,
      [...currentRows(selected)].map(([key, value]) => ({ key, value })),
    ),
  ).toEqual(selected)
})

it('refuses missing identity, duplicate rows and an incomplete current high-water mark', () => {
  const execution = ok(decodeAgentExecutionId('broken-current'))
  expect(() => executionFromRows(execution, [])).toThrow('missing current projection')
  expect(() =>
    executionFromRows(execution, [
      { key: '["execution"]', value: '"another"' },
      { key: '["execution"]', value: '"another"' },
    ]),
  ).toThrow('invalid current projection row')
})
