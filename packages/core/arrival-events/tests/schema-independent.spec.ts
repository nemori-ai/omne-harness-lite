import { describe, expect, test } from 'vitest'
import { judgeArrivalEnvelope, validate, type OpenEvent } from '../src/index.ts'
import { modelTarget, frameTarget, visibility, frameVisibility, opened, image } from './fixtures.ts'

describe('V-3 all nine owned rows of frozen examples §10', () => {
  const imageView: OpenEvent = {
    ...opened('text', 'replace'),
    kind: 'image',
    fill: 'replace',
    head: { mediaType: 'image/png' },
  }
  const inline = { ...image(true), data: { inline: 'iVBORw0KGgo=' } }
  const result = {
    kind: 'tool_result',
    id: 'result',
    visibility: frameVisibility,
    callId: 'c',
    outcome: 'completed',
    blocks: [inline],
  }
  const rows = [
    {
      row: 1,
      target: modelTarget,
      event: { ...opened('text', 'append'), head: { presentation: { hint: 'log' } } },
      rejection: 'presentation_invalid',
    },
    {
      row: 2,
      target: frameTarget,
      event: { t: 'close', index: 0, block: inline },
      rejection: 'frame_media_inline',
    },
    {
      row: 3,
      target: frameTarget,
      event: { t: 'close', index: 0, block: result },
      rejection: 'frame_media_inline',
    },
    {
      row: 4,
      target: frameTarget,
      event: { t: 'fill', index: 2, payload: 'UklGRg==' },
      opened: { ...opened('voice', 'append', true), index: 2 },
      rejection: 'frame_media_inline',
    },
    {
      row: 5,
      target: modelTarget,
      event: { t: 'fill', index: 0, payload: image() },
      opened: opened('text', 'replace'),
      rejection: 'replace_payload_shape',
    },
    {
      row: 6,
      target: modelTarget,
      event: { t: 'fill', index: 5, payload: { ...image(), id: 'b_9' } },
      opened: { ...imageView, index: 5 },
      rejection: 'replace_payload_shape',
    },
    {
      row: 7,
      target: modelTarget,
      event: { t: 'fill', index: 3, payload: 'not base64!' },
      opened: { ...opened('voice', 'replace'), index: 3 },
      rejection: 'replace_payload_shape',
    },
    {
      row: 11,
      target: modelTarget,
      event: { ...opened('voice', 'append'), head: { mediaType: 'image/png' } },
      rejection: 'head_modality_mismatch',
    },
    {
      row: 12,
      target: modelTarget,
      event: { ...opened('text', 'append'), head: { mediaType: 'audio/wav' } },
      rejection: 'head_modality_mismatch',
    },
  ] as const
  for (const row of rows)
    test(`§10 row${row.row} ${row.rejection}`, () => {
      const envelope = { target: row.target, event: row.event }
      expect(validate('ArrivalEnvelope', envelope).valid).toBe(true)
      expect(
        judgeArrivalEnvelope(envelope, 'opened' in row ? () => row.opened : undefined),
      ).toEqual({ rejected: row.rejection })
    })
  test('G-3 every presence of presentation is rejected, no shape-repair or empty default', () => {
    for (const presentation of [
      null,
      {},
      [],
      false,
      'log',
      { hint: 'log' },
      { hint: 'log', language: 'typescript' },
      { hint: '', extra: 1 },
    ])
      expect(
        judgeArrivalEnvelope({
          target: modelTarget,
          event: { ...opened('text', 'append'), head: { presentation } },
        }),
      ).toEqual({ rejected: 'presentation_invalid' })
  })
  test('head canonical MIME modality table and forbidden head metadata stay separate', () => {
    for (const [kind, valid, invalid] of [
      ['text', 'text/plain', 'application/json'],
      ['thinking', 'text/markdown', 'image/png'],
      ['voice', 'audio/pcm;rate=24000', 'video/mp4'],
      ['image', 'image/png', 'text/plain'],
    ] as const) {
      const event = {
        t: 'open',
        index: 0,
        id: 'b',
        visibility,
        kind,
        fill: kind === 'image' ? 'replace' : 'append',
      }
      expect(
        judgeArrivalEnvelope({
          target: modelTarget,
          event: { ...event, head: { mediaType: valid } },
        }),
      ).toEqual({ ok: true })
      expect(
        judgeArrivalEnvelope({
          target: modelTarget,
          event: { ...event, head: { mediaType: invalid } },
        }),
      ).toEqual({ rejected: 'head_modality_mismatch' })
      expect(
        judgeArrivalEnvelope({
          target: modelTarget,
          event: { ...event, head: { mediaType: 'Image/PNG' } },
        }),
      ).toEqual({ rejected: 'malformed' })
    }
    expect(
      judgeArrivalEnvelope({
        target: modelTarget,
        event: {
          ...opened('text', 'append'),
          kind: 'file',
          fill: 'replace',
          head: { mediaType: 'application/octet-stream' },
        },
      }),
    ).toEqual({ ok: true })
    expect(
      judgeArrivalEnvelope({
        target: modelTarget,
        event: {
          ...opened('text', 'append'),
          kind: 'tool_result',
          fill: 'replace',
          head: { mediaType: 'audio/wav' },
        },
      }),
    ).toEqual({ rejected: 'malformed' })
  })
})
describe('S-16 all closed owner causes and in-band dependency', () => {
  for (const cause of [
    'withdrawn',
    'scope_disallowed',
    'modality_mismatch',
    'credential_unavailable',
    'request_rejected',
    'upstream_unavailable',
    'interrupted_mid_reply',
    'unrecognized',
  ])
    test(`FailureCause owner ${cause}`, () => {
      const event = {
        t: 'finish',
        reason: 'lost',
        error: { cause, statusCode: -123, inBand: true },
      }
      expect(judgeArrivalEnvelope({ target: modelTarget, event })).toEqual({ ok: true })
      expect(judgeArrivalEnvelope({ target: frameTarget, event })).toEqual({
        rejected: 'malformed',
      })
    })
  for (const error of [
    { cause: 'unknown' },
    { cause: 'unrecognized', inBand: true },
    { cause: 'unrecognized', statusCode: 1, inBand: false },
    { cause: 'unrecognized', statusCode: 1.5 },
  ])
    test(`invalid error ${JSON.stringify(error)}`, () =>
      expect(
        judgeArrivalEnvelope({
          target: modelTarget,
          event: { t: 'finish', reason: 'lost', error },
        }),
      ).toEqual({ rejected: 'malformed' }))
})
