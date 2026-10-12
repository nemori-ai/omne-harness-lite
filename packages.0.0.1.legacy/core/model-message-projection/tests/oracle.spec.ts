import { describe, expect, it } from 'vitest'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  checkAppendInput,
  checkSourceToken,
  messageLogPayload,
  factLogPayload,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import {
  createProjectionCache,
  extendProjection,
  materializeMessages,
  projectMessages,
  type ProjectionInput,
  type ProjectionRules,
} from '@omne-harness-lite/model-message-projection'

const tenant = { organization: 'oracle-org', account: 'oracle-account' }
const rules: ProjectionRules = {
  version: 'oracle-1',
  external: {
    agentDefinition: '1',
    assembly: '1',
    systemPrompt: '1',
    contextGeneration: '1',
    modelProfile: '1',
    modalities: '1',
    tools: '1',
    parameters: '1',
  },
  system: [],
  pendingCardBlocks: [],
  lastModelRequestPrefixLength: 0,
}
function message(value: unknown): Message {
  const parsed = judgeMessage(value)
  if ('rejected' in parsed) throw new Error(`oracle message: ${parsed.rejected}`)
  return parsed.ok
}
function row(position: number, payload: unknown): LogEntry {
  const parsed = checkAppendInput(
    'oracle-session',
    [{ tenant, readKeys: [], payload }],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in parsed) throw new Error('oracle row')
  return { ...parsed.ok.entries[0]!, session: parsed.ok.session, position }
}
function input(
  entries: readonly LogEntry[],
  selectedRules = rules,
  generation = 'oracle-generation',
): ProjectionInput {
  const parsed = checkSourceToken({
    tenant,
    session: 'oracle-session',
    journalGeneration: generation,
    tail: entries.length,
  })
  if ('failure' in parsed) throw new Error('oracle source')
  return { source: parsed.ok, entries, rules: selectedRules }
}
function output(result: ReturnType<typeof projectMessages>) {
  if (!('projected' in result)) throw new Error(JSON.stringify(result))
  const materialized = materializeMessages(result.projected)
  if (!('materialized' in materialized)) throw new Error('oracle materialization')
  return materialized
}
// This reference uses explicit fixture messages and flat block selection. It does not read production indexes.
function reference(messages: readonly Message[]) {
  const silenced = new Set<string>()
  for (const value of messages)
    if (value.type === 'compaction') {
      for (const ref of value.silenced) silenced.add(`${ref.messageId}/${ref.blockId}`)
    }
  return messages.flatMap(value => {
    const blocks = value.blocks.filter(
      block => block.visibility.toModel && !silenced.has(`${value.id}/${block.id}`),
    )
    return blocks.length === 0 ? [] : [{ ...value, blocks }]
  })
}
function users(size: number, seed: number) {
  return Array.from({ length: size }, (_, index) =>
    message({
      id: `user-${seed}-${index}`,
      type: 'user',
      createdAt: '2026-10-07T00:00:00Z',
      blocks: Array.from({ length: 3 }, (_, block) => ({
        id: `block-${index}-${block}`,
        kind: 'text',
        text: `${seed}:${index}:${block}`,
        visibility: { toHuman: true, toModel: (seed * 17 + index * 13 + block * 7) % 5 !== 0 },
      })),
    }),
  )
}
describe('independent fixed-prefix oracle and finite cache limits', () => {
  it.each(Array.from({ length: 24 }, (_, index) => index + 1))(
    'matches flat visibility and compaction oracle seed %i',
    seed => {
      const sourceMessages = users(32, seed)
      const summary = message({
        id: `summary-${seed}`,
        type: 'compaction',
        createdAt: '2026-10-07T00:01:00Z',
        silenced: sourceMessages.flatMap((value, index) =>
          index % 3 === seed % 3
            ? [{ messageId: value.id, blockId: value.blocks[seed % 3]!.id }]
            : [],
        ),
        blocks: [
          {
            id: `summary-block-${seed}`,
            kind: 'text',
            text: 'summary',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      const expected = [...sourceMessages, summary]
      const entries = sourceMessages.flatMap((value, index) => [
        row(index * 2 + 1, messageLogPayload(value)),
        row(index * 2 + 2, factLogPayload('oracle-event', '1', { index })),
      ])
      entries.push(row(entries.length + 1, messageLogPayload(summary)))
      const actual = output(
        projectMessages(
          input(entries, { ...rules, lastModelRequestPrefixLength: sourceMessages.length }),
        ),
      )
      expect(actual.materialized).toEqual(reference(expected))
      expect(actual.sources.map(value => value.position)).toEqual(
        actual.materialized.map(
          value =>
            entries.find(
              entry => (entry.payload as { value?: { id?: string } }).value?.id === value.id,
            )!.position,
        ),
      )
      expect(writeJsonLossless(actual.materialized)).toBe(writeJsonLossless(reference(expected)))
    },
  )
  it('keeps exact-token recognition valid at capacity and leaves old views usable', () => {
    const entries = users(1, 1).map((value, index) => row(index + 1, messageLogPayload(value)))
    const first = createProjectionCache(input(entries), {
      limits: { entries: 1, blocks: 3, bytes: 8192 },
    })
    if (!('ready' in first)) throw new Error('cache creation')
    expect(extendProjection(first.ready, { ...input(entries), entries: [] })).toEqual({
      projected: first.projected,
      reusedSegments: first.projected.segments,
    })
    const next = row(2, factLogPayload('oracle-event', '1', {}))
    expect(
      extendProjection(first.ready, { ...input([...entries, next]), entries: [next] }),
    ).toEqual({ rebuildRequired: true, reason: 'capacity' })
    expect(output({ projected: first.projected }).materialized).toEqual(reference(users(1, 1)))
    expect(
      createProjectionCache(input(entries), { limits: { entries: 1, blocks: 2, bytes: 8192 } }),
    ).toEqual({ unavailable: true, reason: 'capacity' })
    expect(
      createProjectionCache(input(entries), { limits: { entries: 1, blocks: 3, bytes: 1 } }),
    ).toEqual({ unavailable: true, reason: 'capacity' })
  })
  it('caches history without request-side inputs and invalidates physical history replacements', () => {
    const entries = users(1, 2).map((value, index) => row(index + 1, messageLogPayload(value)))
    const uncached = input(entries, { ...rules, external: null })
    expect(output(projectMessages(uncached)).materialized).toEqual(reference(users(1, 2)))
    expect(
      createProjectionCache(uncached, { limits: { entries: 10, blocks: 10, bytes: 8192 } }),
    ).toHaveProperty('ready')
    const system = message({ ...users(1, 1)[0], type: 'system' })
    if (system.type !== 'system') throw new Error('system fixture')
    expect(
      createProjectionCache(
        { ...uncached, rules: { ...uncached.rules, system: [system] } },
        {
          limits: { entries: 10, blocks: 10, bytes: 8192 },
        },
      ),
    ).not.toHaveProperty('ready')
    const first = createProjectionCache(input(entries), {
      limits: { entries: 10, blocks: 10, bytes: 8192 },
    })
    if (!('ready' in first)) throw new Error('cache creation')
    expect(
      extendProjection(first.ready, { ...input(entries, rules, 'replacement'), entries: [] }),
    ).toEqual({ rebuildRequired: true, reason: 'generation' })
  })
})
