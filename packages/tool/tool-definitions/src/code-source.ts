import { createHash } from 'node:crypto'
import type { JsonValue } from '@omne-harness/json-text'
import type { ProgramFunction, ProgramTools } from '@omne-harness/tool-contract'
import type { Arguments } from './protocol.ts'
import type { AnsweredFailure } from './code-summary.ts'
import { utf8Length } from './text.ts'

const READ = 'Files.read'

/** The program of this call, and the line that names the file it came from when it came from one. */
export type ProgramSource = Readonly<{ source: string; from: string }>
export type SourceRefusal = Readonly<{ refusal: string }>

const text = (value: string): JsonValue => ({ kind: 'string', value })
const member = (value: JsonValue | null, key: string): JsonValue | undefined =>
  value?.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined

const unreadable = (path: string, why: string): SourceRefusal => ({
  refusal: `Code execute failed kind=unreadable\n${path}: ${why}\nNothing ran.`,
})
const tooLarge = (size: string, limit: number): SourceRefusal => ({
  refusal: `Code execute failed kind=too-large\nThe program is ${size}; the limit is ${String(limit)}.\nNothing ran.`,
})

/** Exactly one of `code` and `path`; what else was given is answered as a usage error. */
export function pickedSource(
  args: Arguments,
): Readonly<{ code: string }> | Readonly<{ path: string }> | string {
  const code = args.optionalText('code')
  const path = args.optionalText('path')
  if ((code === undefined) === (path === undefined))
    return 'rejected reason=invalidInput Code execute: give exactly one of code and path'
  return code !== undefined ? { code } : { path: path as string }
}

/** Read once at position 0 by a call of the program: same admission and files scope as any call. */
export async function loadProgram(
  path: string,
  tools: ProgramTools,
  functions: readonly ProgramFunction[],
  limit: number,
  answered: Map<number, AnsweredFailure>,
): Promise<ProgramSource | SourceRefusal> {
  if (!functions.some(one => one.entry === READ))
    return unreadable(path, `${READ} cannot be called by a program now.`)
  const given = await tools.call({
    ordinal: 0,
    entry: READ,
    arguments: {
      kind: 'object',
      entries: [
        { key: 'path', value: text(path) },
        { key: 'limit_bytes', value: { kind: 'number', lexeme: String(limit + 1) } },
      ],
    },
  })
  if (given.kind === 'failure') {
    answered.set(0, { entry: READ, failure: given.failure })
    return unreadable(path, `${given.failure.kind}: ${given.failure.message}`)
  }
  const body = member(given.value, 'text')
  const whole = member(given.value, 'eof')
  if (body?.kind !== 'string') return unreadable(path, 'the file gave no text.')
  if (whole?.kind !== 'boolean' || !whole.value || utf8Length(body.value) > limit)
    return tooLarge(`more than ${String(limit)} bytes`, limit)
  const digest = createHash('sha256').update(body.value).digest('hex')
  return { source: body.value, from: `program: ${path} sha256:${digest}\n` }
}

export function givenProgram(code: string, limit: number): ProgramSource | SourceRefusal {
  const size = utf8Length(code)
  return size > limit ? tooLarge(`${String(size)} bytes`, limit) : { source: code, from: '' }
}
