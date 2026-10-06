import { expect, test } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  captureToolJournalValue,
  environmentToolOf,
  prepareToolJournalEntry,
  projectToolJournal,
} from '../src/index.ts'

const scope = {
  tenant: unwrap(parseTenantId({ organization: 'adoption-org', account: 'alice' })),
  session: unwrap(parseOpaqueIdentifier('adoption-session', 'SessionRef')),
}
const ref = { ...scope, callId: unwrap(parseOpaqueIdentifier('adoption-call', 'CallId')) }
const origin = { run: 'run', attempt: 1, assistantMessage: 'reply' },
  at = '2026-10-06T09:00:00Z'
const selected = {
  capability: 'tool:shell',
  asset: 'shell-asset',
  version: '1',
  adoption: 'original',
  definition: {
    name: 'shell',
    description: 'Run command',
    paradigm: 'single' as const,
    origin: { kind: 'authored' as const },
    input: { type: 'object', properties: {}, description: 'Input' },
    permissions: { execute: { default: 'auto' as const } },
    settings: {
      targetEnvironment: {
        category: 'placement_identity' as const,
        default: { bindingLayer: 'host_machine' as const, facilities: ['command'] },
      },
    },
  },
}
const adoption = {
  placement: {
    scope,
    execution: ref.callId,
    tool: environmentToolOf(selected),
    requirement: { bindingLayer: 'host_machine', facilities: ['command'] },
    permission: 'always-allow',
    revision: 'input/factory',
    evidence: null,
  },
  source: { name: 'current-input', generation: 'original' },
  description: {
    reference: { provider: 'host', reference: 'original' },
    bindingLayer: 'host_machine',
    binding: { kind: 'host_machine' },
    facilities: ['command', 'files'],
    instance: { id: 'original', generation: 'one' },
    continuity: { kind: 'notGuaranteed' },
  },
  providerEvidence: { nonce: 'original' },
}
const intent = { kind: 'execution_intended', revision: 1, ref, origin, selected, input: {} }
const started = { kind: 'execution_started', revision: 1, ref, at }
const adopted = { kind: 'execution_environment_adopted', revision: 1, ref, adoption }
function ended(outcome: 'completed' | 'unavailable' = 'completed') {
  return {
    kind: 'execution_ended',
    revision: 1,
    ref,
    terminal:
      outcome === 'completed'
        ? { outcome, result: 'done' }
        : { outcome, reason: 'environment:unavailable' },
    account: {
      callId: ref.callId,
      initiator: scope.tenant,
      externalEffect: 'unknown',
      cost: { total_usd: 0, items: [] },
      frames: 'unknown',
      wallClock: { startedAt: at, endedAt: at },
    },
    delivery: {
      result: {
        id: 'result',
        kind: 'tool_result',
        callId: ref.callId,
        outcome,
        visibility: { toHuman: true, toModel: true },
        blocks: [],
      },
      pass: 'pass',
      selectedChain: [],
    },
  }
}
function entries(values: readonly unknown[]) {
  return values.map((input, index) => {
    const captured = captureToolJournalValue(input)
    if ('invalid' in captured) throw new Error('invalid fixture value')
    const prepared = prepareToolJournalEntry({ value: captured, origin })
    if ('invalid' in prepared) throw new Error('invalid fixture shell')
    return { ...prepared.entry, session: scope.session, position: index + 1 }
  })
}
test('durable adoption names original input, selected tool and actual instance before an author result', () => {
  const history = projectToolJournal(scope, entries([intent, started, adopted, ended()]))
  if (!('executions' in history)) throw new Error('legal adoption rejected')
  expect(history.executions.get(ref.callId)?.environment?.value.adoption).toEqual(adoption)
  expect(history.executions.get(ref.callId)?.terminal?.value.terminal.outcome).toBe('completed')
})
test.each(
  [
    [intent, adopted],
    [intent, started, ended()],
    [intent, started, adopted, adopted],
    [intent, started, ended('unavailable'), adopted],
    [
      intent,
      started,
      {
        ...adopted,
        adoption: {
          ...adoption,
          placement: {
            ...adoption.placement,
            tool: { ...adoption.placement.tool, definition: 'other' },
          },
        },
      },
    ],
  ].map(values => ({ values })),
)('rejects missing, repeated, late or different-tool adoption (%#)', ({ values }) => {
  expect(projectToolJournal(scope, entries(values))).toEqual({ invalid: true })
})
test.each([
  { scope: { ...scope, session: 'other' } },
  { execution: 'other' },
  { scope: { ...scope, tenant: { ...scope.tenant, account: 'other' } } },
])('codec rejects adoption for another original call before history (%#)', change => {
  expect(
    captureToolJournalValue({
      ...adopted,
      adoption: { ...adoption, placement: { ...adoption.placement, ...change } },
    }),
  ).toEqual({ invalid: true })
})
test('physical cleanup follows a planned resource after terminal but a new permit requires adoption', () => {
  const planned = {
    kind: 'resource_planned',
    revision: 1,
    ref,
    resource: { key: 'process', provider: 'host', reference: { invocation: 'original' } },
  }
  const permitted = { kind: 'resource_permitted', revision: 1, ref, key: 'process' }
  const stopped = {
    kind: 'physical_stop_observed',
    revision: 1,
    ref,
    key: 'process',
    status: 'confirmed',
    at,
  }
  expect(projectToolJournal(scope, entries([intent, started, planned, permitted]))).toEqual({
    invalid: true,
  })
  const history = projectToolJournal(
    scope,
    entries([intent, started, adopted, planned, permitted, ended(), stopped]),
  )
  if (!('executions' in history)) throw new Error('legal original cleanup rejected')
  expect(history.executions.get(ref.callId)?.resources.get('process')?.observations).toHaveLength(1)
  expect(
    projectToolJournal(scope, entries([intent, started, adopted, planned, ended(), permitted])),
  ).toEqual({ invalid: true })
})
test('unavailable may terminate before adoption, while an environment wait cannot', () => {
  expect(
    projectToolJournal(scope, entries([intent, started, ended('unavailable')])),
  ).toHaveProperty('executions')
  const waiting = {
    kind: 'execution_waiting',
    revision: 1,
    ref,
    waitIndex: 1,
    request: { prompt: 'confirm', answerSchema: { type: 'boolean' } },
  }
  expect(projectToolJournal(scope, entries([intent, started, waiting]))).toEqual({ invalid: true })
  expect(projectToolJournal(scope, entries([intent, started, adopted, waiting]))).toHaveProperty(
    'executions',
  )
})
test('ordinary adoption data is captured before caller mutation and contains no live facility', () => {
  const input = structuredClone(adopted),
    expected = structuredClone(adopted)
  const captured = captureToolJournalValue(input)
  expect(captured).toEqual(expected)
  input.adoption.providerEvidence.nonce = 'changed'
  expect(captured).toEqual(expected)
  expect(
    captureToolJournalValue({
      ...adopted,
      adoption: { ...adoption, providerEvidence: { start() {} } },
    }),
  ).toEqual({ invalid: true })
})

test.each(['capability', 'asset', 'version'] as const)(
  'environment identity distinguishes the original selected %s without becoming authority',
  key => {
    const original = environmentToolOf(selected)
    expect(environmentToolOf({ ...selected })).toEqual(original)
    expect(environmentToolOf({ ...selected, [key]: `${selected[key]}-other` })).not.toEqual(
      original,
    )
    expect(Object.isFrozen(original)).toBe(true)
  },
)

test('a pure tool author result does not require an environment adoption', () => {
  const pure = {
    ...intent,
    selected: { ...selected, definition: { ...selected.definition, settings: undefined } },
  }
  // Omit the property: undefined is not ordinary JSON.
  delete pure.selected.definition.settings
  expect(projectToolJournal(scope, entries([pure, started, ended()]))).toHaveProperty('executions')
})

test.each([
  { outcome: 'completed', result: { content: [], isError: false } },
  { outcome: 'failed', code: 'business_failure', result: { content: [], isError: true } },
  { outcome: 'failed', code: 'implementation_error' },
  { outcome: 'failed', code: 'result_rejected' },
])('every supported author terminal requires original adoption (%#)', terminal => {
  const original = ended(),
    value = {
      ...original,
      terminal,
      delivery: {
        ...original.delivery,
        result: { ...original.delivery.result, outcome: terminal.outcome },
      },
    }
  expect(projectToolJournal(scope, entries([intent, started, value]))).toEqual({ invalid: true })
  expect(projectToolJournal(scope, entries([intent, started, adopted, value]))).toHaveProperty(
    'executions',
  )
})

test('a no-answer terminal refers to the original wait while cleanup cannot add a new plan', () => {
  const waiting = {
    kind: 'execution_waiting',
    revision: 1,
    ref,
    waitIndex: 1,
    request: { prompt: 'confirm', answerSchema: { type: 'boolean' } },
  }
  const original = ended(),
    value = {
      ...original,
      terminal: { outcome: 'no_answer', waitIndex: 1 },
      delivery: {
        ...original.delivery,
        result: { ...original.delivery.result, outcome: 'no_answer' },
      },
    }
  expect(
    projectToolJournal(scope, entries([intent, started, adopted, waiting, value])),
  ).toHaveProperty('executions')
  expect(
    projectToolJournal(
      scope,
      entries([
        intent,
        started,
        adopted,
        waiting,
        { ...value, terminal: { outcome: 'no_answer', waitIndex: 2 } },
      ]),
    ),
  ).toEqual({ invalid: true })
  const planned = {
    kind: 'resource_planned',
    revision: 1,
    ref,
    resource: { key: 'after-terminal', provider: 'host', reference: 'original' },
  }
  expect(projectToolJournal(scope, entries([intent, started, adopted, ended(), planned]))).toEqual({
    invalid: true,
  })
})
