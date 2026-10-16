// The synchronous rendering of an author return into one ToolResult (P13).
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import type { TextResultFactory, ToolAuthor } from './authoring.ts'
import type { ResultPolicy } from './execution.ts'
import { jsonTextBytes, jsonValue } from './json-tree.ts'
import type { ToolResult, ToolResultData } from './results.ts'
import { describeRejection } from './shape.ts'
import { sameAdoption, sameSchemaIdentity } from './value-shapes.ts'

type Rendering<B extends ContentBlock> = Outcome<ToolResult<B>, Readonly<{ reason: string }>>
type Author<B extends ContentBlock> = ToolAuthor<unknown, unknown, unknown, B>
type Ordinary<B extends ContentBlock> = Extract<Author<B>, { kind: 'ordinary' }>
type Structured<B extends ContentBlock> = Extract<Author<B>, { kind: 'structured' }>

function failed(stage: string, reason: string): Outcome<never, Readonly<{ reason: string }>> {
  return fail({ reason: `${stage}: ${reason}` })
}

/** The members that only a structured return may set (P13). A text factory must leave them empty. */
function structuredOnly(result: ToolResult<ContentBlock>): string | undefined {
  if (result.original.kind !== 'none') return 'original'
  if (result.attachments.length > 0) return 'attachments'
  if (result.data.kind !== 'none') return 'data'
  return undefined
}

/** P13: the binding fills `data` of an ordinary return by the fixed program encoding. */
function programData<B extends ContentBlock>(
  value: unknown,
  program: Ordinary<B>['program'],
): Outcome<ToolResultData, Readonly<{ reason: string }>> {
  if (program.kind === 'none') return succeed({ kind: 'none' })
  const encoded = program.encode(value)
  if ('failure' in encoded) return failed('program', encoded.failure.reason)
  const tree = jsonValue(encoded.ok, 'data.value')
  if ('failure' in tree) return failed('program', describeRejection(tree.failure))
  if (jsonTextBytes(tree.ok) > program.schema.maxBytes) return failed('program', 'too-large')
  return succeed(
    Object.freeze({
      kind: 'json',
      contract: program.adoption,
      schema: program.schema.identity,
      value: tree.ok,
    }),
  )
}

/** P13: the `data` of a structured return matches the program contract of its author. */
function dataMismatch<B extends ContentBlock>(
  data: ToolResultData,
  program: Structured<B>['program'],
): string | undefined {
  if (program.kind === 'none') return data.kind === 'none' ? undefined : 'program-mismatch'
  if (data.kind !== 'json') return 'program-mismatch'
  if (!sameAdoption(data.contract, program.adoption)) return 'program-mismatch'
  if (!sameSchemaIdentity(data.schema, program.schema.identity)) return 'program-mismatch'
  const tree = jsonValue(data.value, 'value')
  if ('failure' in tree) return describeRejection(tree.failure)
  return jsonTextBytes(tree.ok) > program.schema.maxBytes ? 'too-large' : undefined
}

function judged<B extends ContentBlock>(
  policy: ResultPolicy<B>,
  result: ToolResult<ContentBlock>,
): Rendering<B> {
  const checked = policy.judgeResult(result)
  return 'ok' in checked ? checked : failed('policy', checked.failure.reason)
}

function renderOrdinary<B extends ContentBlock>(
  value: unknown,
  author: Ordinary<B>,
  text: TextResultFactory<B>,
  policy: ResultPolicy<B>,
): Rendering<B> {
  const rendered = author.renderer.render(value)
  if ('failure' in rendered) return failed('render', rendered.failure.reason)
  const produced = text.text(rendered.ok)
  if ('failure' in produced) return failed('text', produced.failure.reason)
  const extra = structuredOnly(produced.ok)
  if (extra !== undefined) return failed('text', `${extra} is only for a structured return`)
  const data = programData(value, author.program)
  if ('failure' in data) return data
  return judged(policy, { ...produced.ok, data: data.ok })
}

function renderStructured<B extends ContentBlock>(
  value: unknown,
  author: Structured<B>,
  policy: ResultPolicy<B>,
): Rendering<B> {
  // The structured overload types `value` as ToolResult<B>; the policy checks the real shape.
  const result = judged(policy, value as ToolResult<ContentBlock>)
  if ('failure' in result) return result
  const mismatch = dataMismatch(result.ok.data, author.program)
  return mismatch === undefined ? result : failed('data', mismatch)
}

/**
 * Renders an ordinary return through its renderer, the text factory and the program encoding.
 * A plain object is an ordinary value even when it has `content`, `data` or `attachments`.
 */
export function renderToolResult<A, R, E, B extends ContentBlock>(
  value: R,
  author: Extract<ToolAuthor<A, R, E, B>, { kind: 'ordinary' }>,
  text: TextResultFactory<B>,
  policy: ResultPolicy<B>,
): Rendering<B>
/** Judges a structured return: whole-result policy, then the match of `data` and its program. */
export function renderToolResult<A, E, B extends ContentBlock>(
  value: ToolResult<B>,
  author: Extract<ToolAuthor<A, never, E, B>, { kind: 'structured' }>,
  text: TextResultFactory<B>,
  policy: ResultPolicy<B>,
): Rendering<B>
/**
 * The author kind alone selects the path; the value is never probed for a ToolResult shape. The
 * function is a synchronous projection: it does not load a schema, check a business rule or
 * save anything. The managed binding runs the complete P13 pipeline around it.
 */
export function renderToolResult<B extends ContentBlock>(
  value: unknown,
  author: Author<B>,
  text: TextResultFactory<B>,
  policy: ResultPolicy<B>,
): Rendering<B> {
  switch (author.kind) {
    case 'ordinary':
      return renderOrdinary(value, author, text, policy)
    case 'structured':
      return renderStructured(value, author, policy)
    default: {
      const exhaustive: never = author
      return exhaustive
    }
  }
}
