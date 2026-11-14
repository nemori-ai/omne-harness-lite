import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { TextResultFactory, ToolAuthor } from './authoring.ts'
import type { ResultPolicy } from './execution.ts'
import { jsonTextBytes, jsonValue } from './json-tree.ts'
import type { ToolRenderedResult, ToolResultData } from './results.ts'
import { describeRejection, isPlainObject, reject, slot, text, type Check } from './shape.ts'
import { sameAdoption, sameSchemaIdentity } from './value-shapes.ts'

type Step<T> = Outcome<T, Readonly<{ reason: string }>>
type Rendering<B extends ContentBlock> = Step<ToolRenderedResult<B>>
type Author<B extends ContentBlock> = ToolAuthor<unknown, unknown, unknown, B>
type Ordinary<B extends ContentBlock> = Extract<Author<B>, { kind: 'ordinary' }>
type Structured<B extends ContentBlock> = Extract<Author<B>, { kind: 'structured' }>

function failed(stage: string, reason: string): Step<never> {
  return fail({ reason: `${stage}: ${reason}` })
}

function outcome<T>(stage: string, returned: unknown, ok: Check<T>): Step<T> {
  if (!isPlainObject(returned)) return failed(stage, 'not-an-outcome')
  const success = slot(returned, 'ok')
  if (success.kind === 'value') {
    const checked = ok(success.value, 'ok')
    return 'failure' in checked ? failed(stage, describeRejection(checked.failure)) : checked
  }
  const failure = slot(returned, 'failure')
  const reason =
    failure.kind === 'value' && isPlainObject(failure.value)
      ? slot(failure.value, 'reason')
      : undefined
  if (reason?.kind === 'value' && typeof reason.value === 'string')
    return failed(stage, reason.value)
  return failed(stage, 'not-an-outcome')
}

function callAuthor<T>(stage: string, call: () => unknown, ok: Check<T>): Step<T> {
  let returned: unknown
  try {
    returned = call()
  } catch (error) {
    return failed(stage, error instanceof Error ? error.message : 'thrown')
  }
  return outcome(stage, returned, ok)
}

const resultObject: Check<object> = (value, at) =>
  isPlainObject(value) ? succeed(value) : reject(at, 'type')

function isNone(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  const kind = slot(value, 'kind')
  return kind.kind === 'value' && kind.value === 'none'
}

const EMPTY: Readonly<Record<'original' | 'attachments' | 'data', (value: unknown) => boolean>> = {
  original: isNone,
  attachments: value => Array.isArray(value) && value.length === 0,
  data: isNone,
}

function structuredOnly(result: object): string | undefined {
  for (const [name, empty] of Object.entries(EMPTY)) {
    const read = slot(result, name)
    if (read.kind === 'accessor' || (read.kind === 'value' && !empty(read.value))) return name
  }
  return undefined
}

function programData<B extends ContentBlock>(
  value: unknown,
  program: Ordinary<B>['program'],
): Step<ToolResultData> {
  if (program.kind === 'none') return succeed({ kind: 'none' })
  const tree = callAuthor(
    'program',
    () => program.encode(value),
    encoded => jsonValue(encoded, 'data.value'),
  )
  if ('failure' in tree) return tree
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
  result: ToolRenderedResult<ContentBlock>,
): Rendering<B> {
  const checked = policy.judgeResult(result)
  return 'ok' in checked ? checked : failed('policy', checked.failure.reason)
}

function renderOrdinary<B extends ContentBlock>(
  value: unknown,
  author: Ordinary<B>,
  factory: TextResultFactory<B>,
  policy: ResultPolicy<B>,
): Rendering<B> {
  const rendered = callAuthor('render', () => author.renderer.render(value), text)
  if ('failure' in rendered) return rendered
  const produced = outcome('text', factory.text(rendered.ok), resultObject)
  if ('failure' in produced) return produced
  const extra = structuredOnly(produced.ok)
  if (extra !== undefined) return failed('text', `${extra} is only for a structured return`)
  const data = programData(value, author.program)
  if ('failure' in data) return data
  return judged(policy, { ...produced.ok, data: data.ok } as ToolRenderedResult<ContentBlock>)
}

function renderStructured<B extends ContentBlock>(
  value: unknown,
  author: Structured<B>,
  policy: ResultPolicy<B>,
): Rendering<B> {
  const result = judged(policy, value as ToolRenderedResult<ContentBlock>)
  if ('failure' in result) return result
  const mismatch = dataMismatch(result.ok.data, author.program)
  return mismatch === undefined ? result : failed('data', mismatch)
}

export function renderToolResult<A, R, E, B extends ContentBlock>(
  value: R,
  author: Extract<ToolAuthor<A, R, E, B>, { kind: 'ordinary' }>,
  text: TextResultFactory<B>,
  policy: ResultPolicy<B>,
): Rendering<B>
export function renderToolResult<A, E, B extends ContentBlock>(
  value: ToolRenderedResult<B>,
  author: Extract<ToolAuthor<A, never, E, B>, { kind: 'structured' }>,
  text: TextResultFactory<B>,
  policy: ResultPolicy<B>,
): Rendering<B>
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
    default:
      return unknownKind(author)
  }
}

function unknownKind(_author: never): Step<never> {
  return failed('author', 'kind')
}
