import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { describe, expect, it } from 'vitest'
import {
  projectMessages,
  createProjectionCache as createCache,
  extendProjection,
  materializeMessages,
  releaseProjectionCache,
  type ProjectionRules,
  type ProjectionInput,
} from '@omne-harness-lite/model-message-projection'
import {
  checkAppendInput,
  checkSourceToken,
  factLogPayload,
  messageLogPayload,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  attemptStartedPayload,
  sessionFactPayload,
  checkOperationRef,
} from '@omne-harness-lite/session-runtime'
function opaque<T extends 'MessageId' | 'BlockId'>(value: string, kind: T) {
  const parsed = parseOpaqueIdentifier(value, kind)
  if (!('ok' in parsed)) throw new Error('invalid identity')
  return parsed.ok
}
const cacheOptions = { limits: { entries: 4096, blocks: 4096, bytes: 8 * 1024 * 1024 } }
function createProjectionCache(input: ProjectionInput) {
  return createCache(input, cacheOptions)
}
const tenant = { organization: 'org-a', account: 'account-a' }
const rules = {
  version: 'r1',
  external: {
    agentDefinition: 'a1',
    assembly: 's1',
    systemPrompt: 'p1',
    contextGeneration: 'c1',
    modelProfile: 'm1',
    modalities: 'text',
    tools: 't1',
    parameters: 'v1',
  },
  system: [],
  pendingCardBlocks: [],
  lastModelRequestPrefixLength: 0,
} satisfies ProjectionRules
function row(position: number, payload: unknown): LogEntry {
  const checked = checkAppendInput(
    'session-a' as LogEntry['session'],
    [{ tenant, readKeys: [], payload }],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked) throw new Error('bad fixture')
  return { ...checked.ok.entries[0]!, session: checked.ok.session, position }
}
function user(position: number, visible = true): LogEntry {
  const value = judgeMessage({
    id: `m${position}`,
    type: 'user',
    createdAt: '2026-10-07T00:00:00Z',
    blocks: [
      {
        kind: 'text',
        id: `b${position}`,
        text: String(position),
        visibility: { toHuman: true, toModel: visible },
      },
    ],
  })
  if ('rejected' in value) throw new Error('bad message')
  return row(position, messageLogPayload(value.ok))
}
function input(
  entries: readonly LogEntry[],
  selectedRules: ProjectionRules = rules,
): ProjectionInput {
  const source = checkSourceToken({
    tenant,
    session: 'session-a',
    journalGeneration: 'journal-a',
    tail: entries.length,
  })
  if ('failure' in source) throw new Error('bad source')
  return { source: source.ok, entries, rules: selectedRules }
}
function messages(value: ReturnType<typeof projectMessages>) {
  expect('projected' in value).toBe(true)
  if (!('projected' in value)) throw new Error('not projected')
  const result = materializeMessages(value.projected)
  if (!('materialized' in result)) throw new Error('not materialized')
  return result.materialized
}
describe('fixed log projection and prefix reuse', () => {
  it('validates Session lifecycle facts and includes only their original business messages', () => {
    const create = checkOperationRef({
      tenant,
      principal: 'account-a',
      operation: 'createSession',
      operationKey: 'create',
      session: null,
    })
    const submit = checkOperationRef({
      tenant,
      principal: 'account-a',
      operation: 'submitInput',
      operationKey: 'submit',
      session: 'session-a',
    })
    if ('failure' in create || 'failure' in submit) throw new Error('invalid operation fixture')
    const at = '2026-10-08T00:00:00Z'
    const entries = [
      row(
        1,
        sessionFactPayload({
          kind: 'session_created',
          operation: create.operation,
          definition: { category: 'agent_definition', name: 'agent' },
          executionType: 'main',
          mode: 'auto_permission',
          collaboration: 'co-work',
          workspace: null,
          at,
        }),
      ),
      user(2),
      row(
        3,
        sessionFactPayload({
          kind: 'input_accepted',
          operation: submit.operation,
          semanticDigest: 'semantic',
          messagePosition: 2,
          at,
        }),
      ),
      row(
        4,
        sessionFactPayload({
          kind: 'run_started',
          run: 'run-a' as never,
          inputPosition: 2,
          stepKey: 'start',
          at,
        }),
      ),
      {
        ...row(
          5,
          attemptStartedPayload({
            kind: 'attempt_started',
            run: 'run-a',
            attempt: 1,
            reason: 'first',
            at,
          }),
        ),
        run: 'run-a',
        attempt: 1,
      },
      {
        ...row(
          6,
          sessionFactPayload({
            kind: 'input_adopted',
            run: 'run-a' as never,
            attempt: 1,
            inputPosition: 2,
            stepKey: 'adopt',
            at,
          }),
        ),
        run: 'run-a',
        attempt: 1,
      },
      {
        ...row(
          7,
          sessionFactPayload({
            kind: 'run_finished',
            run: 'run-a' as never,
            attempt: 1,
            terminal: 'completed',
            reason: 'no remaining work',
            stepKey: 'finish',
            at,
          }),
        ),
        run: 'run-a',
        attempt: 1,
      },
    ]
    const projected = messages(projectMessages(input(entries)))
    expect(projected).toHaveLength(1)
    expect(projected[0]).toMatchObject({
      id: 'm2',
      type: 'user',
      blocks: [{ id: 'b2', kind: 'text', text: '2' }],
    })
    expect(
      projectMessages(
        input(
          entries.map(entry =>
            entry.position === 3
              ? row(
                  3,
                  factLogPayload('session-runtime', '1', {
                    kind: 'input_accepted',
                    operation: create.operation,
                    semanticDigest: 'semantic',
                    messagePosition: 2,
                    at,
                  }),
                )
              : entry,
          ),
        ),
      ),
    ).toEqual({ invalidInput: true, reason: 'claimedPayload' })
  })
  it('saves non-message events without model reminders; preserves business reminders', () => {
    const attempt = {
      ...row(
        2,
        attemptStartedPayload({
          kind: 'attempt_started',
          run: 'run-a',
          attempt: 1,
          reason: 'first',
          at: '2026-10-07T00:00:00Z',
        }),
      ),
      run: 'run-a',
      attempt: 1,
    }
    const reminder = judgeMessage({
      id: 'reminder',
      type: 'system_reminder',
      nature: 'event',
      source: { kind: 'scheduled_trigger', schedule: 'schedule-a', dueAt: '2026-10-07T00:00:00Z' },
      createdAt: '2026-10-07T00:00:00Z',
      blocks: [
        {
          kind: 'text',
          id: 'reminder-b',
          text: 'scheduled work',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if ('rejected' in reminder) throw new Error('bad reminder')
    const result = projectMessages(
      input([
        user(1),
        attempt,
        row(3, factLogPayload('unknown-owner', '1', { secret: 'not a message' })),
        row(4, messageLogPayload(reminder.ok)),
      ]),
    )
    expect(messages(result).map(message => message.id)).toEqual(['m1', 'reminder'])
  })
  it('hot append shares the original prefix and does not alter old views', () => {
    const first = createProjectionCache(input([user(1)]))
    if (!('ready' in first)) throw new Error('not ready')
    const extended = extendProjection(first.ready, {
      ...input([user(1), user(2)]),
      entries: [user(2)],
    })
    if (!('projected' in extended)) throw new Error('not extended')
    expect(extended.projected.segments?.previous).toBe(first.projected.segments)
    expect(messages({ projected: first.projected }).map(value => value.id)).toEqual(['m1'])
    expect(messages(extended)).toEqual(messages(projectMessages(input([user(1), user(2)]))))
    expect(extended.projected.workCounters.entries - first.projected.workCounters.entries).toBe(1)
    expect(extendProjection(first.ready, { ...input([user(1), user(2)]), entries: [] })).toEqual({
      projected: extended.projected,
      reusedSegments: extended.projected.segments,
    })
    expect(releaseProjectionCache(first.ready)).toEqual({ released: true })
    expect(extendProjection(first.ready, input([]))).toEqual({
      invalidInput: true,
      reason: 'shape',
    })
  })
  it.each(['8', '9', 'unknown'])('rejects a claimed messages fact at version %s', version => {
    const payload = { owner: 'messages', version, kind: 'fact', value: {} }
    const forged = { ...row(1, factLogPayload('unrelated-owner', '1', {})), payload }
    expect(
      checkAppendInput(
        'session-a',
        [{ tenant, readKeys: [], payload }],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      ),
    ).toEqual({ failure: 'invalidInput' })
    expect(projectMessages(input([forged]))).toEqual({
      invalidInput: true,
      reason: 'claimedPayload',
    })
    expect(() => factLogPayload('messages', version, {})).toThrow(TypeError)
  })
  it.each(Object.keys(rules.external))('invalidates the cache when %s changes', name => {
    const first = createProjectionCache(input([user(1)]))
    if (!('ready' in first)) throw new Error('not ready')
    const changed = { ...rules, external: { ...rules.external, [name]: 'changed' } }
    expect(
      extendProjection(first.ready, { ...input([user(1), user(2)], changed), entries: [user(2)] }),
    ).toEqual({ rebuildRequired: true, reason: 'external' })
  })
  it('rejects gaps, other scopes, malformed claimed facts and forged views', () => {
    expect(projectMessages(input([user(2)]))).toEqual({ invalidInput: true, reason: 'source' })
    expect(
      projectMessages(
        input([
          row(1, {
            owner: 'session-runtime',
            version: '1',
            kind: 'fact',
            value: { kind: 'attempt_started' },
          }),
        ]),
      ),
    ).toEqual({ invalidInput: true, reason: 'claimedPayload' })
    expect(materializeMessages({} as never)).toEqual({ invalidInput: true, reason: 'shape' })
    let reads = 0
    expect(
      projectMessages({
        get source() {
          reads++
          throw new Error('getter')
        },
      } as never),
    ).toEqual({ invalidInput: true, reason: 'shape' })
    expect(reads).toBe(0)
  })
  it('cold work grows linearly and append work depends only on delta', () => {
    for (const size of [64, 128, 256]) {
      const entries = Array.from({ length: size }, (_, index) =>
        index % 2 === 0
          ? user(index + 1)
          : row(index + 1, factLogPayload('other-owner', '1', { index })),
      )
      const result = createProjectionCache(input(entries))
      if (!('ready' in result)) throw new Error('not ready')
      expect(result.projected.workCounters).toEqual({
        entries: size,
        blocks: size / 2,
        references: 0,
        messages: size / 2,
      })
      const next = user(size + 1)
      const extension = extendProjection(result.ready, {
        ...input([...entries, next]),
        entries: [next],
      })
      if (!('projected' in extension)) throw new Error('not extended')
      expect(extension.projected.workCounters.entries - result.projected.workCounters.entries).toBe(
        1,
      )
      expect(extension.projected.segments?.previous).toBe(result.projected.segments)
    }
  })
  it('compaction changes old blocks only after cold rebuild; summaries stay visible', () => {
    const compaction = judgeMessage({
      id: 'summary',
      type: 'compaction',
      createdAt: '2026-10-07T00:00:00Z',
      silenced: [{ messageId: 'm1', blockId: 'b1' }],
      blocks: [
        {
          kind: 'text',
          id: 'summary-b',
          text: 'summary',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if ('rejected' in compaction) throw new Error('bad compaction')
    const selectedRules = { ...rules, lastModelRequestPrefixLength: 1 }
    const first = createProjectionCache(input([user(1)], selectedRules))
    if (!('ready' in first)) throw new Error('not ready')
    const next = row(2, messageLogPayload(compaction.ok))
    expect(
      extendProjection(first.ready, { ...input([user(1), next], selectedRules), entries: [next] }),
    ).toEqual({ rebuildRequired: true, reason: 'impactUnknown' })
    expect(
      messages(projectMessages(input([user(1), next], selectedRules))).map(value => value.id),
    ).toEqual(['summary'])
    expect(messages({ projected: first.projected }).map(value => value.id)).toEqual(['m1'])
    expect(
      projectMessages(
        input([user(1), next], {
          ...selectedRules,
          pendingCardBlocks: [
            { messageId: opaque('m1', 'MessageId'), blockId: opaque('b1', 'BlockId') },
          ],
        }),
      ),
    ).toEqual({ invalidInput: true, reason: 'compaction' })
  })
})

it('does not execute caller code while reading cache limits', () => {
  let reads = 0
  const result = createCache(input([user(1)]), {
    get limits() {
      reads++
      return cacheOptions.limits
    },
  })
  expect(result).toEqual({ invalidInput: true, reason: 'shape' })
  expect(reads).toBe(0)
})
it('pins trusted codec selection and rejects reentrant extension or release', () => {
  const codecs = new Map<string, import('@omne-harness-lite/model-message-projection').FactReader>([
    ['cache-owner', () => 'valid'],
  ])
  let owner: import('@omne-harness-lite/model-message-projection').CacheOwner | undefined
  const nested: unknown[] = [],
    next = row(2, factLogPayload('cache-owner', '1', { valid: true }))
  const delta = { ...input([user(1), next]), entries: [next] }
  const entryReader = () => {
    if (owner !== undefined) {
      nested.push(extendProjection(owner, delta), releaseProjectionCache(owner))
    }
    return 'valid' as const
  }
  const first = createCache(input([user(1)]), {
    ...cacheOptions,
    factReaders: codecs,
    entryReaders: [entryReader],
  })
  if (!('ready' in first)) throw Error('cache fixture unavailable')
  owner = first.ready
  codecs.set('cache-owner', () => 'invalid')
  const extended = extendProjection(owner, delta)
  expect(extended).toHaveProperty('projected')
  expect(nested).toEqual([
    { invalidInput: true, reason: 'shape' },
    { invalidInput: true, reason: 'shape' },
  ])
  if (!('projected' in extended)) throw Error('cache extension unavailable')
  expect(messages(extended)).toEqual(messages({ projected: first.projected }))
  expect(releaseProjectionCache(owner)).toEqual({ released: true })
})
it('rejects a foreign fact that claims reserved model keys', () => {
  const entry = {
    ...row(1, factLogPayload('unrelated-owner', '1', {})),
    readKeys: ['mrr/3/claimed'],
  }
  expect(projectMessages(input([entry]))).toEqual({ invalidInput: true, reason: 'claimedPayload' })
})
it('bounds normalized UTF-8 input bytes and does not publish a partial extension', () => {
  const firstInput = input([user(1)])
  const first = createCache(firstInput, {
    limits: {
      entries: 100,
      blocks: 100,
      bytes: new TextEncoder().encode(JSON.stringify(firstInput)).length,
    },
  })
  if (!('ready' in first)) throw Error('cache fixture unavailable')
  const next = row(2, factLogPayload('unrelated-owner', '1', { text: '汉字'.repeat(50) }))
  expect(extendProjection(first.ready, { ...input([user(1), next]), entries: [next] })).toEqual({
    rebuildRequired: true,
    reason: 'capacity',
  })
  expect(messages({ projected: first.projected }).map(message => message.id)).toEqual(['m1'])
  releaseProjectionCache(first.ready)
})
