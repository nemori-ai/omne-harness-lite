import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, functionDefinition, ok, text } from './runtime-values.ts'
import { jsonDocumentFixture, jsonLinesFixture } from './structured-body-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

const L = 2048
const P = Math.min(configuration().offloading.previewUtf8Bytes, Math.floor(L / 8))
const HEADER = '\n[offloaded body]\n'
const bytes = (value: string) => Buffer.byteLength(value, 'utf8')

type Declared = Pick<
  NonNullable<Parameters<typeof settlementFixture>[0]>,
  'definition' | 'bodySchemas'
>

async function firstScreen(
  body: string,
  declared: Declared,
  maxInlineUtf8Bytes = L,
): Promise<Readonly<{ screen: string; preview: string }>> {
  const f = await settlementFixture({
    ...declared,
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes },
    value: {
      content: [text('answer', body)],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  expect(ok(await f.preserve()).phase).toBe('settled')
  const value = (await f.resultPage()).value
  expect(value.original.kind).toBe('offloaded')
  const screen = value.content
    .flatMap(block => (block.kind === 'text' && block.visibility.toModel ? [block.text] : []))
    .join('')
  return { screen, preview: screen.slice(0, screen.indexOf(HEADER)) }
}

function jsonLines() {
  const { definition, bodySchemas } = jsonLinesFixture([])
  return { definition, bodySchemas }
}

it('previews JSON Lines as whole first and last records', async () => {
  const records = Array.from({ length: 80 }, (_, row) => JSON.stringify({ row, label: 'record' }))
  const { screen, preview } = await firstScreen(`${records.join('\n')}\n`, jsonLines())
  expect(bytes(preview)).toBeLessThanOrEqual(P)
  expect(bytes(screen)).toBeLessThanOrEqual(L)
  const [head = '', tail = ''] = preview.split('[... omitted ...]\n')
  const shownHead = head.split('\n').filter(line => line !== '')
  const shownTail = tail.split('\n').filter(line => line !== '')
  expect(shownHead.length).toBeGreaterThan(0)
  expect(shownTail.length).toBeGreaterThan(0)
  expect(shownHead).toEqual(records.slice(0, shownHead.length))
  expect(shownTail).toEqual(records.slice(records.length - shownTail.length))
})

it('names the position and size of a JSON Lines record too large to preview', async () => {
  const record = JSON.stringify({ label: 'x'.repeat(3000) })
  const { preview } = await firstScreen(`${record}\n`, jsonLines())
  expect(preview).toContain(`[record 1 of 1: ${bytes(record) + 1} bytes, too large to show]`)
  expect(preview).not.toContain('xxxx')
})

function jsonDocument() {
  const { definition, bodySchemas } = jsonDocumentFixture('{}')
  return { definition, bodySchemas }
}

it('outlines a JSON document breadth-first in key order without JSON text', async () => {
  const document = JSON.stringify({ zeta: { inner: 1 }, alpha: [{ x: 1 }], mid: 'm'.repeat(3000) })
  const { preview } = await firstScreen(document, jsonDocument())
  expect(bytes(preview)).toBeLessThanOrEqual(P)
  expect(preview.split('\n').filter(line => line !== '')).toEqual([
    'Outline (breadth-first, document key order):',
    '$: object (3 keys)',
    '$."zeta": object (1 keys)',
    '$."alpha": array (1 items)',
    '$."mid": string',
    '$."zeta"."inner": number',
    '$."alpha"[0]: object (1 keys)',
    '$."alpha"[0]."x": number',
  ])
})

it('labels a truncated outline and never shows a cut JSON text', async () => {
  const members = Object.fromEntries(
    Array.from({ length: 60 }, (_, index) => [`key${index}`, 'v'.repeat(40)]),
  )
  const { preview } = await firstScreen(JSON.stringify(members), jsonDocument())
  expect(bytes(preview)).toBeLessThanOrEqual(P)
  expect(preview.endsWith('[outline truncated]\n')).toBe(true)
  expect(preview).not.toMatch(/[{}]|vvvv/u)
})

it('bounds the preview by the threshold divided by k when the declared threshold is small', async () => {
  const base = functionDefinition()
  if (base.kind !== 'function') throw new Error('fixture must define a function')
  const T = 2048
  const definition: ToolDefinition = {
    ...base,
    returns: {
      ...base.returns,
      offloading: {
        inline: { kind: 'bounded', maxInlineUtf8Bytes: T },
        retention: { kind: 'system' },
      },
    },
  }
  const line = 'line of body text\n'
  const { screen, preview } = await firstScreen(line.repeat(400), { definition }, 65_536)
  expect(bytes(preview)).toBeLessThanOrEqual(Math.floor(T / 8))
  expect(bytes(preview)).toBeGreaterThan(Math.floor(T / 8) - 2 * bytes(line))
  expect(bytes(screen)).toBeLessThanOrEqual(T)
})

it('puts the header after the author content', async () => {
  const declared = jsonDocumentFixture('{"report":true}')
  const f = await settlementFixture(declared)
  expect(ok(await f.preserve()).phase).toBe('settled')
  const value = (await f.resultPage()).value
  const visible = value.content.flatMap(block =>
    block.kind === 'text' && block.visibility.toModel ? [block.text] : [],
  )
  expect(visible.join('')).toMatch(
    /^JSON report\n\[offloaded body\]\nBody format: json-document\n/u,
  )
})
