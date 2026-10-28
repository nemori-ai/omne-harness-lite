import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fields, integer, literal, object, string, digest } from '../integration/parse.ts'
import { InputError } from './protocol.ts'

export const INITIAL_DISPATCH_TEMPLATE =
  '.meta_harness/human/map-reduce-delivery/templates/line-initial-dispatch.md'
export const INITIAL_DISPATCH_REMAINING_GUARDS = [
  'Read back current binding, owner, attempt and dispatch revision; duplicate forwarding must resume the same execution.',
  'Read every pinned input from the target machine and verify its revision and digest.',
  'Verify active/idle/terminal entry, the current real reduce card and the continuation chain from authoritative records.',
  'Validate exact runtime recipes against the installed tool and harness policy on the target machine.',
  'Inspect all resolved values for secrets and contradictions with the binding and line package.',
] as const

export type InitialDispatchInput = {
  schemaVersion: 1
  milestone: number
  line: string
  revision: number
  fields: Record<string, string>
}

export function parseInitialDispatchInput(value: unknown): InitialDispatchInput {
  const v = fields(
    value,
    ['schemaVersion', 'milestone', 'line', 'revision', 'fields'],
    'initial dispatch',
  )
  const line = string(v.line, 'initial dispatch.line')
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(line)) throw new InputError('initial-dispatch-line-invalid')
  const values = Object.fromEntries(
    Object.entries(object(v.fields, 'initial dispatch.fields')).map(([name, value]) => [
      name,
      string(value, `initial dispatch.fields.${name}`),
    ]),
  )
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'initial dispatch.schemaVersion'),
    milestone: integer(v.milestone, 'initial dispatch.milestone'),
    line,
    revision: integer(v.revision, 'initial dispatch.revision'),
    fields: values,
  }
}

export function initialDispatchFields(template: string): string[] {
  return [
    ...new Set(
      [...messageTemplate(template).matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)].map(match => match[1]!),
    ),
  ].sort()
}

function messageTemplate(template: string): string {
  const marker = '# 消息正文\n'
  const parts = template.split(marker)
  if (parts.length !== 2 || parts[1] === undefined)
    throw new InputError('initial-dispatch-template-marker')
  return parts[1].trim() + '\n'
}

/** Materializes a message only. Authorization and target-runtime verification remain explicit owner duties. */
export function renderInitialDispatch(template: string, input: InitialDispatchInput): string {
  const expected = initialDispatchFields(template)
  const actual = Object.keys(input.fields).sort()
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new InputError(
      `initial-dispatch-fields-mismatch: missing=${expected.filter(key => !actual.includes(key)).join(',')} extra=${actual.filter(key => !expected.includes(key)).join(',')}`,
    )
  if (input.fields.dispatch_revision !== String(input.revision))
    throw new InputError('initial-dispatch-revision-mismatch')
  const body = messageTemplate(template).replace(
    /\{\{([a-z][a-z0-9_]*)\}\}/g,
    (_, name: string) => input.fields[name] ?? '',
  )
  if (/\{\{|\}\}/.test(body)) throw new InputError('initial-dispatch-unresolved-field')
  if (
    /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:ant-)?[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|https:\/\/smee\.io\/|Authorization:\s*Bearer\s+\S+)/i.test(
      body,
    )
  )
    throw new InputError('initial-dispatch-secret-or-channel')
  return body
}

export function initialDispatchPath(root: string, input: InitialDispatchInput): string {
  return resolve(
    root,
    'tmp',
    `milestone-${input.milestone}`,
    'dispatch',
    `${input.line}-r${input.revision}.md`,
  )
}

export function generateInitialDispatch(
  root: string,
  template: string,
  input: InitialDispatchInput,
) {
  const path = initialDispatchPath(root, input)
  const body = renderInitialDispatch(template, input)
  mkdirSync(dirname(path), { recursive: true })
  let reused = false
  try {
    writeFileSync(path, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
    if (readFileSync(path, 'utf8') !== body)
      throw new InputError('initial-dispatch-revision-conflict')
    reused = true
  }
  return {
    schemaVersion: 1,
    status: 'GENERATED',
    path,
    sha256: digest(body),
    reused,
    remainingGuards: INITIAL_DISPATCH_REMAINING_GUARDS,
  }
}

export function validateInitialDispatch(
  root: string,
  template: string,
  input: InitialDispatchInput,
) {
  const path = initialDispatchPath(root, input)
  const body = readFileSync(path, 'utf8')
  if (body !== renderInitialDispatch(template, input))
    throw new InputError('initial-dispatch-file-changed')
  return {
    schemaVersion: 1,
    status: 'STRUCTURE_CHECKED',
    path,
    sha256: digest(body),
    remainingGuards: INITIAL_DISPATCH_REMAINING_GUARDS,
    next: 'The reduce owner must verify every remaining guard before recording VALIDATED. Open through the host UI only after that. Opening, human forwarding and claim readback are separate facts.',
  }
}
