import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  defaultResultPolicy,
  defaultResultPolicyAdoption,
  defaultResultPolicyRules,
} from '@omne-harness/tool'
import { reference, result, text } from './tool-values.ts'

it('names the default result policy with a digest that a reader can recompute', () => {
  const digest = createHash('sha256').update(JSON.stringify(defaultResultPolicyRules)).digest('hex')
  expect(defaultResultPolicyAdoption).toEqual({
    owner: '@omne-harness/tool',
    name: 'default-result-policy',
    revision: '1',
    digest: `sha256:${digest}`,
  })
})

it('accepts only text and shared reference blocks and names what it rejects', () => {
  expect(defaultResultPolicyRules.accept).toEqual([
    'text',
    'voice-reference',
    'image-reference',
    'file-reference',
  ])
  expect(defaultResultPolicyRules.reject).toEqual([
    'thinking',
    'inline-media',
    'inline-file',
    'nested-container',
    'unknown-kind',
  ])
})

it('cannot be changed in place after import', () => {
  expect(Object.isFrozen(defaultResultPolicyRules)).toBe(true)
  expect(Object.isFrozen(defaultResultPolicyRules.accept)).toBe(true)
  expect(Object.isFrozen(defaultResultPolicyAdoption)).toBe(true)
})

describe('default result policy', () => {
  const visibility = { toHuman: true, toModel: true }
  const ref = reference('media', 'a.png')
  const forms: readonly (readonly [string, unknown])[] = [
    ['thinking', { kind: 'thinking', id: 'b', visibility, text: 'hm' }],
    [
      'inline-media',
      { kind: 'image', id: 'b', visibility, mediaType: 'image/png', inline: 'AA==' },
    ],
    [
      'inline-media',
      { kind: 'voice', id: 'b', visibility, mediaType: 'audio/wav', inline: 'AA==' },
    ],
    [
      'inline-file',
      { kind: 'file', id: 'b', visibility, storage: 's', key: 'k', mediaType: 'text/plain' },
    ],
    ['nested-container', { kind: 'tool_result', callId: 'c', content: [] }],
    ['nested-container', { kind: 'text', id: 'b', visibility, text: 'x', blocks: [] }],
    ['unknown-kind', { kind: 'video', id: 'b', visibility }],
    ['unknown-kind', 'text'],
  ]

  it('accepts text blocks and shared reference blocks', () => {
    const blocks = [
      text('t', 'hello'),
      { kind: 'image', id: 'i', visibility, ref, transcript: null },
      { kind: 'voice', id: 'v', visibility, ref, transcript: 'spoken words' },
      { kind: 'file', id: 'f', visibility, ref, transcript: null },
    ] as const
    for (const block of blocks)
      expect(defaultResultPolicy.judge(block as never)).toEqual({ ok: block })
    expect(defaultResultPolicy.adoption).toBe(defaultResultPolicyAdoption)
  })

  it.each(forms)('rejects a %s block with that rule name', (rule, block) => {
    expect(defaultResultPolicy.judge(block as never)).toEqual({ failure: { reason: rule } })
  })

  it('returns only rule names that its published rule set lists as rejected', () => {
    expect([...new Set(forms.map(([rule]) => rule))].sort()).toEqual(
      [...defaultResultPolicyRules.reject].sort(),
    )
  })

  it('names the broken field of an accepted kind', () => {
    const broken = {
      kind: 'image',
      id: 'i',
      visibility,
      ref: { ...ref, digest: '' },
      transcript: null,
    }
    expect(defaultResultPolicy.judge(broken as never)).toEqual({
      failure: { reason: 'invalid-digest' },
    })
  })

  it('judges every block of a whole result, including the summary of an offloaded original', () => {
    const thinking = { kind: 'thinking', id: 's', visibility, text: 'hm' }
    const offloaded = {
      ...result([text('t', 'ok')]),
      original: { kind: 'offloaded', source: ref, summary: [thinking] },
    }
    expect(defaultResultPolicy.judgeResult(offloaded as never)).toEqual({
      failure: { reason: 'original.summary[0]: thinking' },
    })
    const badAttachment = result([text('t', 'ok')], [{ ...ref, bytes: '-1' }])
    expect(defaultResultPolicy.judgeResult(badAttachment)).toEqual({
      failure: { reason: 'attachments[0]: bytes' },
    })
    expect(defaultResultPolicy.judgeResult(result([text('t', 'ok')], [ref]))).toEqual({
      ok: result([text('t', 'ok')], [ref]),
    })
  })
})
