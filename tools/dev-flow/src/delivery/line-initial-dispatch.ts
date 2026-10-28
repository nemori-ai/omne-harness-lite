import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { array, fields, integer, literal, object, string, digest } from '../integration/parse.ts'
import { sha256Hex } from './identifiers.ts'
import { InputError } from './protocol.ts'

export const INITIAL_DISPATCH_TEMPLATE =
  '.meta_harness/human/map-reduce-delivery/templates/line-initial-dispatch.md'
export const INITIAL_DISPATCH_REMAINING_GUARDS = [
  'Read back the binding on every referenced task card and the line pack; duplicate forwarding must resume the same execution.',
  'Check that every referenced owner document, skill and tool exists at F on the target machine.',
  'Explain every non-zero exit code in the rehearsal evidence before recording VALIDATED.',
  'Inspect all resolved values for secrets and contradictions with the binding and line pack.',
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
  const schemaVersion = literal(v.schemaVersion, 1, 'initial dispatch.schemaVersion')
  const line = string(v.line, 'initial dispatch.line')
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(line)) throw new InputError('initial-dispatch-line-invalid')
  const values = Object.fromEntries(
    Object.entries(object(v.fields, 'initial dispatch.fields')).map(([name, value]) => [
      name,
      string(value, `initial dispatch.fields.${name}`),
    ]),
  )
  return {
    schemaVersion,
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

export type RehearsedCommand = {
  /** The command as written in the rendered message, placeholders included. */
  readonly command: string
  /**
   * The concrete command line that ran, when placeholders were substituted. Record only:
   * matching against the message uses `command`, never `executed`.
   */
  readonly executed?: string
  readonly exitCode: number
  readonly outputSummary: string
}

export type RehearsalEvidence = {
  readonly schemaVersion: 1
  readonly messageSha256: string
  readonly commands: readonly RehearsedCommand[]
}

function exitCode(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255)
    throw new InputError(`${path} must be an integer from 0 to 255`)
  return value
}

function rehearsedCommand(item: unknown, path: string): RehearsedCommand {
  const c = fields(item, ['command', 'executed', 'exitCode', 'outputSummary'], path)
  return {
    command: string(c.command, `${path}.command`),
    ...(c.executed === undefined ? {} : { executed: string(c.executed, `${path}.executed`) }),
    exitCode: exitCode(c.exitCode, `${path}.exitCode`),
    outputSummary: string(c.outputSummary, `${path}.outputSummary`),
  }
}

/** One answer per command: two entries whose commands normalize alike are refused. */
function uniqueCommands(commands: readonly RehearsedCommand[]): readonly RehearsedCommand[] {
  const seen = new Map<string, number>()
  commands.forEach((entry, index) => {
    const key = normalizeCommand(entry.command)
    const first = seen.get(key)
    if (first !== undefined)
      throw new InputError(
        `rehearsal evidence.commands[${index}] repeats the command of commands[${first}]`,
      )
    seen.set(key, index)
  })
  return commands
}

export function parseRehearsalEvidence(value: unknown): RehearsalEvidence {
  const v = fields(value, ['schemaVersion', 'messageSha256', 'commands'], 'rehearsal evidence')
  const schemaVersion = literal(v.schemaVersion, 1, 'rehearsal evidence.schemaVersion')
  return {
    schemaVersion,
    messageSha256: sha256Hex(v.messageSha256, 'rehearsal evidence.messageSha256'),
    commands: uniqueCommands(
      array(v.commands, 'rehearsal evidence.commands').map((item, index) =>
        rehearsedCommand(item, `rehearsal evidence.commands[${index}]`),
      ),
    ),
  }
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

const SHELL_LANGUAGES: ReadonlySet<string> = new Set(['sh', 'bash', 'shell', 'zsh'])

type Fence = { readonly char: string; readonly length: number }
type FencedBlock = {
  readonly fence: Fence
  readonly language: string
  /** One-based line number of the opening fence. */
  readonly line: number
  readonly lines: string[]
}

/** A CommonMark opening fence: up to three spaces, then three or more backticks or tildes. */
function openingFence(text: string, line: number): FencedBlock | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text)
  if (match === null) return undefined
  const [, marker = '', info = ''] = match
  const language = (info.trim().split(/\s+/)[0] ?? '').toLowerCase()
  return { fence: { char: marker[0]!, length: marker.length }, language, line, lines: [] }
}

/** A closing fence repeats the opening character at least as often and has no info string. */
function closesFence(text: string, fence: Fence): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text)
  return match?.[1]?.[0] === fence.char && match[1].length >= fence.length
}

function fencedBlocks(markdown: string): FencedBlock[] {
  const blocks: FencedBlock[] = []
  let open: FencedBlock | undefined
  for (const [index, text] of markdown.split(/\r\n|\r|\n/).entries()) {
    if (open === undefined) open = openingFence(text, index + 1)
    else if (closesFence(text, open.fence)) {
      blocks.push(open)
      open = undefined
    } else open.lines.push(text)
  }
  if (open !== undefined)
    throw new InputError(`initial-dispatch-fence-unclosed: the code block at line ${open.line}`)
  return blocks
}

/** Blank lines and `#` comments are skipped; a trailing backslash joins the next line. */
function blockCommands(lines: readonly string[]): string[] {
  const commands: string[] = []
  let pending = ''
  for (const line of lines) {
    const text = line.trim()
    if (pending === '' && (text === '' || text.startsWith('#'))) continue
    if (text.endsWith('\\')) {
      pending += text.slice(0, -1) + ' '
      continue
    }
    commands.push(normalizeCommand(pending + text))
    pending = ''
  }
  if (pending !== '') commands.push(normalizeCommand(pending))
  return commands
}

/**
 * Lists the commands of a message whose fenced code blocks are all shell blocks
 * (`sh`, `bash`, `shell`, `zsh`; the first word of the info string, in any case).
 * Fences follow CommonMark. An unclosed block, or any other block including an
 * untagged one, is refused. Inline code is not a command by template rule.
 */
export function fencedShellCommands(markdown: string): string[] {
  const blocks = fencedBlocks(markdown)
  const other = blocks.find(block => !SHELL_LANGUAGES.has(block.language))
  if (other !== undefined)
    throw new InputError(
      `initial-dispatch-non-shell-block: the ${other.language === '' ? 'untagged' : `"${other.language}"`} code block at line ${other.line}; the message may hold shell code blocks only`,
    )
  return [...new Set(blocks.flatMap(block => blockCommands(block.lines)))]
}

function rehearsalCoverage(body: string, evidence: RehearsalEvidence) {
  const commands = fencedShellCommands(body)
  const rehearsed = new Set(evidence.commands.map(entry => normalizeCommand(entry.command)))
  const missing = commands.filter(command => !rehearsed.has(command))
  if (missing.length > 0)
    throw new InputError(
      `initial-dispatch-rehearsal-missing: ${missing.length} command(s) without evidence: ${missing.join(' | ')}`,
    )
  const message = new Set(commands)
  return {
    matchedCommands: commands.length,
    extraEntries: evidence.commands
      .filter(entry => !message.has(normalizeCommand(entry.command)))
      .map(entry => entry.command),
  }
}

export function validateInitialDispatch(
  root: string,
  template: string,
  input: InitialDispatchInput,
  evidence: RehearsalEvidence,
) {
  const path = initialDispatchPath(root, input)
  const body = readFileSync(path, 'utf8')
  if (body !== renderInitialDispatch(template, input))
    throw new InputError('initial-dispatch-file-changed')
  const sha256 = digest(body)
  if (evidence.messageSha256 !== sha256)
    throw new InputError('initial-dispatch-rehearsal-message-mismatch')
  return {
    schemaVersion: 1,
    status: 'STRUCTURE_CHECKED',
    path,
    sha256,
    ...rehearsalCoverage(body, evidence),
    nonZeroExits: evidence.commands
      .filter(entry => entry.exitCode !== 0)
      .map(entry => ({ command: entry.command, exitCode: entry.exitCode })),
    remainingGuards: INITIAL_DISPATCH_REMAINING_GUARDS,
    next: 'The reduce owner must verify every remaining guard before recording VALIDATED. Open through the host UI only after that. Opening and human forwarding are separate facts.',
  }
}
