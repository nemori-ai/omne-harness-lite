import { expect, it } from 'vitest'
import { createModalityProjection } from '@omne-harness-lite/model-message-projection'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  checkAppendInput,
  messageLogPayload,
  factLogPayload,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import {
  readSettlementPrefix,
  type SettlementLogBinding,
  type SettlementRegistration,
} from '@omne-harness-lite/model-request-runtime'

const scope = {
  tenant: unwrap(parseTenantId({ organization: 'org', account: 'account' })),
  session: unwrap(parseOpaqueIdentifier('session', 'SessionRef')),
}
const visibility = { toHuman: true, toModel: true }
function message(position: number, blocks: unknown[], type = 'user', extra = {}): LogEntry {
  const value = judgeMessage({
    id: `message-${position}`,
    type,
    createdAt: '2026-10-10T00:00:00Z',
    blocks,
    ...extra,
  })
  if (!('ok' in value)) throw new Error(`invalid test message: ${value.rejected}`)
  return entry(position, messageLogPayload(value.ok))
}
function entry(position: number, payload: unknown): LogEntry {
  const checked = checkAppendInput(
    scope.session,
    [{ tenant: scope.tenant, readKeys: [], payload }],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if ('failure' in checked) throw new Error('invalid test entry')
  return { ...checked.ok.entries[0]!, session: scope.session, position }
}
function media(id: string, kind = 'image', extra = {}) {
  return {
    id,
    kind,
    visibility,
    mediaType: kind === 'voice' ? 'audio/wav' : 'image/png',
    data: { inline: 'AA==' },
    ...extra,
  }
}
function source() {
  let entries: readonly LogEntry[] = [],
    generation = 'one',
    live = true
  const physical = Object.freeze({})
  const binding: SettlementLogBinding = {
    ...scope,
    generation: physical,
    currentGeneration: () => (live ? physical : null),
    log: {
      append: async () => {
        throw new Error('unused')
      },
      readByKey: async () => {
        throw new Error('unused')
      },
      readSince: async () => {
        throw new Error('unused')
      },
    },
    readPrefix: async () => ({
      entries,
      tail: entries.length,
      source: { ...scope, journalGeneration: generation, tail: entries.length },
    }),
  }
  const registration: SettlementRegistration = {
    start(_kind, operation) {
      const completion = operation(new AbortController().signal)
      return {
        completion,
        stopped: completion.then(
          () => {},
          () => {},
        ),
        requestStop() {},
      }
    },
    release() {},
  }
  return {
    set(next: readonly LogEntry[], nextGeneration = generation) {
      entries = next
      generation = nextGeneration
    },
    stop() {
      live = false
    },
    async read() {
      const read = await readSettlementPrefix({ binding, registration })
      if (!('prefix' in read)) throw new Error(`prefix unavailable: ${read.reason}`)
      return read.prefix
    },
  }
}
it('derives original visible media and skips transcripts, hidden media and non-media files', async () => {
  const s = source(),
    project = createModalityProjection(scope)
  s.set([
    message(1, [
      media('image'),
      media('voice', 'voice'),
      {
        id: 'video',
        kind: 'file',
        visibility,
        attachment: { storage: 'test', key: 'video', mediaType: 'video/mp4' },
      },
      {
        id: 'pdf',
        kind: 'file',
        visibility,
        attachment: { storage: 'test', key: 'pdf', mediaType: 'application/pdf' },
      },
      media('transcript', 'image', {
        transcript: 'description',
        renderings: [
          {
            producedBy: 'system',
            blocks: [{ id: 'derived', kind: 'text', visibility, text: 'description' }],
          },
        ],
      }),
      media('hidden', 'image', { visibility: { toHuman: true, toModel: false } }),
    ]),
  ])
  expect(await project(await s.read())).toEqual({ known: ['text', 'image', 'audio', 'video'] })
})
it('keeps original modalities across compaction and reconstructs an earlier or new-generation prefix', async () => {
  const s = source(),
    project = createModalityProjection(scope)
  const image = message(1, [media('image')])
  s.set([image])
  const first = await s.read()
  expect(await project(first)).toEqual({ known: ['image'] })
  const summary = message(
    2,
    [{ id: 'summary', kind: 'text', visibility, text: 'summary' }],
    'compaction',
    { silenced: [{ messageId: 'message-1', blockId: 'image' }] },
  )
  s.set([image, summary])
  expect(await project(await s.read())).toEqual({ known: ['text', 'image'] })
  expect(await project(first)).toEqual({ known: ['image'] })
  s.set([message(1, [{ id: 'replacement', kind: 'text', visibility, text: 'new history' }])], 'two')
  expect(await project(await s.read())).toEqual({ known: ['text'] })
})
it('ignores non-message facts and returns the same immutable result for the same fixed tail', async () => {
  const s = source(),
    project = createModalityProjection(scope)
  s.set([entry(1, factLogPayload('test', '1', { text: 'image', kind: 'attempt' }))])
  const a = await project(await s.read()),
    b = await project(await s.read())
  expect(a).toEqual({ known: [] })
  expect(b).toBe(a)
  expect(Object.isFrozen(a)).toBe(true)
  if ('known' in a) expect(Object.isFrozen(a.known)).toBe(true)
})
it('rejects another scope and a copied or expired prefix without exposing cached modalities', async () => {
  const s = source(),
    project = createModalityProjection(scope)
  s.set([message(1, [media('image')])])
  const prefix = await s.read()
  expect(
    await createModalityProjection({
      ...scope,
      session: unwrap(parseOpaqueIdentifier('other', 'SessionRef')),
    })(prefix),
  ).toEqual({ unknown: true })
  // @ts-expect-error A copied shape has no owned-prefix identity.
  expect(await project({ ...prefix })).toEqual({ unknown: true })
  expect(await project(prefix)).toEqual({ known: ['image'] })
  s.stop()
  expect(await project(prefix)).toEqual({ unknown: true })
})
it('skips all descendants of an invisible tool result', async () => {
  const s = source(),
    project = createModalityProjection(scope)
  s.set([
    message(
      1,
      [
        {
          id: 'result',
          kind: 'tool_result',
          callId: 'call',
          outcome: 'completed',
          visibility: { toHuman: true, toModel: false },
          blocks: [media('nested')],
        },
      ],
      'tool',
      { callId: 'call' },
    ),
  ])
  expect(await project(await s.read())).toEqual({ known: [] })
})

it('includes visible descendants and excludes a hidden child of a visible tool result', async () => {
  const s = source(),
    project = createModalityProjection(scope)
  s.set([
    message(
      1,
      [
        {
          id: 'result',
          kind: 'tool_result',
          callId: 'call',
          outcome: 'completed',
          visibility,
          blocks: [
            media('nested'),
            media('hidden-voice', 'voice', { visibility: { toHuman: true, toModel: false } }),
          ],
        },
      ],
      'tool',
      { callId: 'call' },
    ),
  ])
  expect(await project(await s.read())).toEqual({ known: ['image'] })
})

it('rebuilds for another physical binding at the same logical coordinate', async () => {
  const a = source(),
    b = source(),
    project = createModalityProjection(scope)
  a.set([message(1, [media('image')])])
  b.set([message(1, [media('voice', 'voice')])])
  expect(await project(await a.read())).toEqual({ known: ['image'] })
  expect(await project(await b.read())).toEqual({ known: ['audio'] })
})
