import { expect, test, vi } from 'vitest'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { createParameterJudge, judgeToolDefinition } from '@omne-harness-lite/tool-definition'
import type { ToolExecutor } from '@omne-harness-lite/tool-execution-runtime'
import { createSessionResultReader, sessionResultDefinition } from '../src/session-result-reader.ts'

function reference(bytes = 3) {
  const value = readJsonStrict(
    JSON.stringify({
      storage: 'cli-tool-results',
      key: 'original-key',
      mediaType: 'text/plain',
      bytes,
    }),
  )
  if (!('ok' in value)) throw new Error('invalid fixture')
  return value.ok
}
function dependencies(session: string): Parameters<ToolExecutor>[1] {
  return {
    context: {
      read: async () => ({
        kind: 'values',
        values: [
          {
            key: 'tool-results.scope',
            value: session,
            revision: session,
            observedAt: '2026-10-10T00:00:00Z',
          },
        ],
      }),
    },
    signal: new AbortController().signal,
    wait: async () => ({ kind: 'rejected', reason: 'unavailable' }),
    frames: { emit: () => ({ kind: 'dropped', why: 'closed' }) },
    costs: { report: async () => 'unavailable' },
  }
}
test('Result has a valid callable definition and reads the scope from actual Context', async () => {
  expect(judgeToolDefinition(sessionResultDefinition, createParameterJudge())).toEqual({ ok: true })
  const read = vi.fn(async () => Buffer.from('abc'))
  expect(await createSessionResultReader(read)(reference(), dependencies('original-session'))).toBe(
    'abc',
  )
  expect(read).toHaveBeenCalledWith(
    'original-session',
    expect.objectContaining({ storage: 'cli-tool-results', key: 'original-key' }),
  )
})
test('Result rejects oversized attachments before reading and does not hide unavailable bytes', async () => {
  const read = vi.fn(async () => undefined)
  expect(
    await createSessionResultReader(read)(reference(524289), dependencies('original-session')),
  ).toContain('limit')
  expect(read).not.toHaveBeenCalled()
  expect(await createSessionResultReader(read)(reference(), dependencies('original-session'))).toBe(
    'Attachment unavailable.',
  )
})

test('Result returns image bytes inline instead of assigning another call its original attachment', async () => {
  const image = readJsonStrict(
    '{"storage":"cli-tool-results","key":"old-call-image","mediaType":"image/png","bytes":3}',
  )
  if (!('ok' in image)) throw new Error('invalid image fixture')
  const result = await createSessionResultReader(async () => new Uint8Array([1, 2, 3]))(
    image.ok,
    dependencies('original-session'),
  )
  expect(result).toMatchObject({ content: [{ kind: 'image', data: { inline: 'AQID' } }] })
  expect(JSON.stringify(result)).not.toContain('old-call-image')
})
