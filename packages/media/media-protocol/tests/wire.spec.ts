import { describe, expect, it } from 'vitest'
import { mediaProtocol } from '@omne-harness/media-protocol'
import { expectRoundTrip, limits, readSample, tenant, tree } from './fixtures/samples.ts'

const operations = mediaProtocol.operations
const ref = {
  storage: 'local',
  key: '0123456789abcdef0123456789abcdef',
  mediaType: 'image/png',
  bytes: '39458',
  digest: 'sha256:9104',
}
const image = { kind: 'image', widthPixels: 640, heightPixels: 480 }
const voice = { kind: 'voice', durationMs: 1200, sampleRate: 16000, channels: 1 }
const uploading = { kind: 'uploading', nextSequence: 2, partBytes: 262144 }
const committed = { kind: 'committed', ref, facts: image }
const definition = { name: 'voice', revision: '1' }
const engine = { name: 'voice.transcribe', revision: '1' }
const words = { ...ref, mediaType: 'text/plain', bytes: '20480' }
const PREPROCESS = [
  { kind: 'not-needed' },
  { kind: 'not-started' },
  { kind: 'running' },
  {
    kind: 'done',
    representation: { outcome: 'converted', definition, engine, text: 'hello', others: [] },
  },
  {
    kind: 'done',
    representation: { outcome: 'converted', definition, engine, text: words, others: [ref] },
  },
  { kind: 'done', representation: { outcome: 'inconvertible', definition, engine } },
  ...[
    'basis-unavailable',
    'engine-unavailable',
    'engine-error',
    'timeout',
    'invalid-result',
    'outcome-unknown',
    'cancelled',
  ].map(reason => ({ kind: 'failed', reason })),
]

describe('the bodies of media/v1 go to the wire and back unchanged', () => {
  it.each([
    ['begin-upload', { tenant, upload: 'up-1', mediaType: 'image/png', bytes: 39458 }],
    ['append-upload-part', { tenant, upload: 'up-1', sequence: 0, part: 'aGVsbG8=' }],
    ['commit-upload', { tenant, upload: 'up-1', digest: 'sha256:9104' }],
    ['query-upload', { tenant, upload: 'up-1' }],
    ['read-media-page', { tenant, ref, offset: 0, limit: 65536 }],
    [
      'read-media-page',
      {
        tenant,
        ref,
        offset: 0,
        limit: 65536,
        target: { mediaTypes: ['image/webp'], maxBytes: 20000, maxWidth: 128, maxHeight: 128 },
      },
    ],
    ['describe-media', { tenant, ref }],
    ['prepare-media', { tenant, ref }],
  ] as const)('%s', (name, body) => {
    expectRoundTrip(operations[name].body, body)
  })

  it('a name is read from revision 3 on, and an end at revision 2 is neither sent nor told one', () => {
    const named = {
      tenant,
      upload: 'up-1',
      mediaType: 'application/pdf',
      bytes: 10,
      name: '季度报告.pdf',
    }
    expectRoundTrip(operations['begin-upload'].body, named)
    expect(operations['begin-upload'].body.read(tree(named), limits, 3).ok).toBe(true)
    expect(operations['begin-upload'].body.read(tree(named), limits, 2).ok).toBe(false)
    const described = operations['describe-media'].outcomes.succeeded
    const answer = {
      state: 'held',
      facts: { kind: 'file' },
      preprocess: { kind: 'not-needed' },
      name: '季度报告.pdf',
    } as const
    const now = described.write(answer as never, limits, 3)
    const before = described.write(answer as never, limits, 2)
    expect(now.ok && JSON.stringify(now.value)).toContain('季度报告.pdf')
    expect(before.ok && JSON.stringify(before.value)).not.toContain('季度报告.pdf')
  })

  it('a part is bytes in the process and base64 on the wire', () => {
    const body = expectRoundTrip(operations['append-upload-part'].body, {
      tenant,
      upload: 'up-1',
      sequence: 3,
      part: 'aGVsbG8=',
    }) as { part: Uint8Array }
    expect(new TextDecoder().decode(body.part)).toBe('hello')
  })

  it.each([
    ['begin-upload', { tenant, upload: 'up-1', mediaType: 'image/png' }],
    ['begin-upload', { tenant, upload: 'up-1', mediaType: 'image/png', bytes: '10' }],
    ['begin-upload', { tenant, upload: '', mediaType: 'image/png', bytes: 10 }],
    ['append-upload-part', { tenant, upload: 'up-1', sequence: -1, part: 'aGVsbG8=' }],
    ['append-upload-part', { tenant, upload: 'up-1', sequence: 0, part: 'not base64!' }],
    ['commit-upload', { tenant, upload: 'up-1' }],
    ['query-upload', { upload: 'up-1' }],
    ['read-media-page', { tenant, ref: { ...ref, extra: 'x' }, offset: 0, limit: 10 }],
    ['read-media-page', { tenant, ref, offset: 0, limit: 10, target: { maxBytes: 1 } }],
    ['describe-media', { tenant, ref: { ...ref, bytes: 39458 } }],
  ] as const)('%s refuses a body outside its rule', (name, body) => {
    expect(readSample(operations[name].body, body)).toEqual({ ok: false })
  })
})

describe('the outcomes of media/v1 go to the wire and back unchanged', () => {
  it.each([
    ['begin-upload', 'succeeded', { status: uploading }],
    ['begin-upload', 'succeeded', { status: committed }],
    ['begin-upload', 'limited', { limit: 8388608 }],
    ['begin-upload', 'unsupported', {}],
    ['begin-upload', 'invalid', { field: 'upload' }],
    ['begin-upload', 'invalid', { field: 'bytes' }],
    ['append-upload-part', 'succeeded', { nextSequence: 3 }],
    ['append-upload-part', 'not-found', {}],
    ['append-upload-part', 'conflict', { reason: 'other-bytes' }],
    ['append-upload-part', 'conflict', { reason: 'committed' }],
    ['append-upload-part', 'invalid', { reason: 'gap', nextSequence: 1 }],
    ['append-upload-part', 'invalid', { reason: 'beyond-declared' }],
    ['append-upload-part', 'limited', { limit: 262144 }],
    ['commit-upload', 'succeeded', { ref, facts: image }],
    ['commit-upload', 'succeeded', { ref: { ...ref, mediaType: 'audio/wav' }, facts: voice }],
    ['commit-upload', 'succeeded', { ref, facts: { kind: 'file' } }],
    ['commit-upload', 'not-found', {}],
    ['commit-upload', 'invalid', { reason: 'incomplete', nextSequence: 2 }],
    ['commit-upload', 'invalid', { reason: 'digest-mismatch' }],
    ['commit-upload', 'invalid', { reason: 'type-mismatch' }],
    ['commit-upload', 'invalid', { reason: 'over-budget' }],
    ['query-upload', 'succeeded', { status: uploading }],
    ['query-upload', 'succeeded', { status: committed }],
    ['query-upload', 'not-found', {}],
    [
      'read-media-page',
      'succeeded',
      { part: 'aGVsbG8=', next: 5, mediaType: 'image/png', bytes: 39458, facts: image },
    ],
    [
      'read-media-page',
      'succeeded',
      { part: '', next: null, mediaType: 'image/webp', bytes: 0, facts: image },
    ],
    ['read-media-page', 'not-found', { reason: 'reference' }],
    ['read-media-page', 'not-found', { reason: 'material' }],
    ['read-media-page', 'limited', {}],
    [
      'describe-media',
      'succeeded',
      { state: 'staged', facts: image, preprocess: { kind: 'not-needed' } },
    ],
    [
      'describe-media',
      'succeeded',
      { state: 'held', facts: voice, preprocess: { kind: 'running' } },
    ],
    ['describe-media', 'not-found', {}],
    ['prepare-media', 'not-found', {}],
  ] as const)('%s %s %j', (name, outcome, body) => {
    const outcomes = operations[name].outcomes as Record<string, unknown>
    expectRoundTrip(outcomes[outcome] as never, body)
  })

  it.each([
    ['begin-upload', 'succeeded', { status: { kind: 'uploading', nextSequence: 2 } }],
    ['begin-upload', 'invalid', { field: 'tenant' }],
    ['append-upload-part', 'conflict', { reason: 'gap' }],
    ['commit-upload', 'succeeded', { ref, facts: { kind: 'video' } }],
    ['commit-upload', 'invalid', { reason: 'too-slow' }],
    ['read-media-page', 'not-found', { reason: 'other' }],
    [
      'describe-media',
      'succeeded',
      { state: 'uploading', facts: image, preprocess: { kind: 'running' } },
    ],
    ['describe-media', 'succeeded', { state: 'held', facts: image }],
    ['prepare-media', 'succeeded', { preprocess: { kind: 'failed', reason: 'tired' } }],
    [
      'prepare-media',
      'succeeded',
      {
        preprocess: {
          kind: 'done',
          representation: { outcome: 'converted', definition, engine, text: 7, others: [] },
        },
      },
    ],
    [
      'prepare-media',
      'succeeded',
      { preprocess: { kind: 'done', representation: { outcome: 'inconvertible', definition } } },
    ],
  ] as const)('%s %s refuses %j', (name, outcome, body) => {
    const outcomes = operations[name].outcomes as Record<string, unknown>
    expect(readSample(outcomes[outcome] as never, body)).toEqual({ ok: false })
  })
})

describe('what preprocessing came to goes to the wire and back unchanged', () => {
  it.each(PREPROCESS)('prepare-media and describe-media carry %j', preprocess => {
    expectRoundTrip(operations['prepare-media'].outcomes.succeeded, { preprocess })
    expectRoundTrip(operations['describe-media'].outcomes.succeeded, {
      state: 'held',
      facts: voice,
      preprocess,
    })
  })

  it('observe-media opens on one medium of a tenant and says only that it changed', () => {
    const observation = mediaProtocol.observations['observe-media']
    expectRoundTrip(observation.open, { tenant, ref })
    expectRoundTrip(observation.frame, { kind: 'changed' })
    expect(
      readSample(observation.frame, { kind: 'changed', preprocess: { kind: 'running' } }),
    ).toEqual({ ok: false })
    expect(readSample(observation.open, { tenant })).toEqual({ ok: false })
  })
})
