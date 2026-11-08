import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Adoption, ResultPage, ToolFailure } from '@omne-harness/tool-contract'
import { tenantKey } from './boundary.ts'

/** The projection a cursor binds. Only the complete result projection exists today. */
const PROJECTION = 'full'

type Cursor = Readonly<{
  tenant: string
  call: string
  result: string
  projection: string
  block: number
}>

function cursorText(cursor: Cursor): string {
  return JSON.stringify(cursor)
}

function isCursor(value: unknown): value is Cursor {
  if (typeof value !== 'object' || value === null) return false
  const block: unknown = Reflect.get(value, 'block')
  return (
    ['tenant', 'call', 'result', 'projection'].every(
      key => typeof Reflect.get(value, key) === 'string',
    ) &&
    typeof block === 'number' &&
    Number.isSafeInteger(block) &&
    block >= 0
  )
}

/** Reads a cursor and checks that it was issued for this result (P08: no silent version change). */
function readCursor(after: string, expected: Cursor): Outcome<number, ToolFailure> {
  let parsed: unknown
  try {
    parsed = JSON.parse(after)
  } catch {
    return fail({ kind: 'invalid-cursor', reason: 'not-a-cursor' })
  }
  if (!isCursor(parsed)) return fail({ kind: 'invalid-cursor', reason: 'not-a-cursor' })
  const bound =
    parsed.tenant === expected.tenant &&
    parsed.call === expected.call &&
    parsed.result === expected.result &&
    parsed.projection === expected.projection
  if (!bound) return fail({ kind: 'invalid-cursor', reason: 'another-result' })
  return succeed(parsed.block)
}

function blockBytes(block: ContentBlock): number {
  return Buffer.byteLength(JSON.stringify(block))
}

/**
 * The blocks from `start` that fit in `pageBytes`, at least one. A first block larger than the
 * page cannot be split (P08) cannot be split by this reader.
 */
function pageBlocks<B extends ContentBlock>(
  content: readonly B[],
  start: number,
  pageBytes: number,
  adoption: Adoption,
): Outcome<Readonly<{ blocks: readonly B[]; end: number }>, ToolFailure> {
  let end = start
  let used = 0
  while (end < content.length) {
    const block = content[end]
    if (block === undefined) break
    const bytes = blockBytes(block)
    if (used + bytes > pageBytes) {
      if (end === start) return unsupportedPage(adoption, end, bytes, pageBytes)
      break
    }
    used += bytes
    end += 1
  }
  return succeed({ blocks: content.slice(start, end), end })
}

function unsupportedPage(
  adoption: Adoption,
  index: number,
  bytes: number,
  pageBytes: number,
): Outcome<never, ToolFailure> {
  return fail({
    kind: 'unsupported',
    adoption,
    reason: `content block ${index} is ${bytes} bytes, over the ${pageBytes}-byte page, and cannot be split between pages`,
  })
}

/** Pure pagination shared by production custody and consumers holding the same fixed result. */
export function pageToolResult<B extends ContentBlock>(
  input: Pick<CallAccess<unknown>, 'tenant' | 'call'> &
    Readonly<{ after: string | null; pageBytes: number; adoption: Adoption }>,
  result: Omit<ResultPage<B>, 'next'>,
): Outcome<ResultPage<B>, ToolFailure> {
  const bound: Cursor = {
    tenant: tenantKey(input.tenant),
    call: input.call,
    result: result.result,
    projection: PROJECTION,
    block: 0,
  }
  const start = input.after === null ? succeed(0) : readCursor(input.after, bound)
  if ('failure' in start) return start
  // A cursor is issued only for a block that exists, so a cursor at or after the end is not one
  // of ours; a page is never empty (at least one block).
  if (input.after !== null && start.ok >= result.value.content.length)
    return fail({ kind: 'invalid-cursor', reason: 'past-the-end' })
  const page = pageBlocks(result.value.content, start.ok, input.pageBytes, input.adoption)
  if ('failure' in page) return page
  const next = page.ok.end < result.value.content.length ? { ...bound, block: page.ok.end } : null
  return succeed({
    ...result,
    value: { ...result.value, content: page.ok.blocks },
    next: next === null ? null : cursorText(next),
  })
}
