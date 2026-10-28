import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { array, fields, integer, literal, object, string, digest } from '../integration/parse.ts'
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

export type RehearsedCommand = {
  /** The command as written in the rendered message, placeholders included. */
  command: string
  /** The concrete command line that ran, when placeholders were substituted. */
  executed?: string
  exitCode: number
  outputSummary: string
}

export type RehearsalEvidence = {
  schemaVersion: 1
  messageSha256: string
  commands: RehearsedCommand[]
}

function exitCode(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255)
    throw new InputError(`${path} must be an integer from 0 to 255`)
  return value
}

export function parseRehearsalEvidence(value: unknown): RehearsalEvidence {
  const v = fields(value, ['schemaVersion', 'messageSha256', 'commands'], 'rehearsal evidence')
  const messageSha256 = string(v.messageSha256, 'rehearsal evidence.messageSha256')
  if (!/^[0-9a-f]{64}$/.test(messageSha256))
    throw new InputError('rehearsal evidence.messageSha256 must be a lowercase SHA-256')
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'rehearsal evidence.schemaVersion'),
    messageSha256,
    commands: array(v.commands, 'rehearsal evidence.commands').map((item, index) => {
      const path = `rehearsal evidence.commands[${index}]`
      const c = fields(item, ['command', 'executed', 'exitCode', 'outputSummary'], path)
      return {
        command: string(c.command, `${path}.command`),
        ...(c.executed === undefined ? {} : { executed: string(c.executed, `${path}.executed`) }),
        exitCode: exitCode(c.exitCode, `${path}.exitCode`),
        outputSummary: string(c.outputSummary, `${path}.outputSummary`),
      }
    }),
  }
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

/**
 * Lists the commands in ```sh, ```bash, ```shell and ```zsh blocks. Blank lines and
 * `#` comments are skipped; a trailing backslash joins the next line. Inline code is
 * not a command by template rule.
 */
export function fencedShellCommands(markdown: string): string[] {
  const commands: string[] = []
  let fence: 'shell' | 'other' | undefined
  let pending = ''
  for (const line of markdown.split('\n')) {
    const marker = /^\s*```\s*([A-Za-z0-9_+-]*)\s*$/.exec(line)
    if (marker !== null) {
      if (fence === undefined) {
        fence = ['sh', 'bash', 'shell', 'zsh'].includes(marker[1]!) ? 'shell' : 'other'
      } else {
        if (pending !== '') commands.push(normalizeCommand(pending))
        pending = ''
        fence = undefined
      }
      continue
    }
    if (fence !== 'shell') continue
    const text = line.trim()
    if (pending === '' && (text === '' || text.startsWith('#'))) continue
    if (text.endsWith('\\')) {
      pending += text.slice(0, -1) + ' '
      continue
    }
    commands.push(normalizeCommand(pending + text))
    pending = ''
  }
  return [...new Set(commands)]
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
  const rehearsed = new Set(evidence.commands.map(entry => normalizeCommand(entry.command)))
  const missing = fencedShellCommands(body).filter(command => !rehearsed.has(command))
  if (missing.length > 0)
    throw new InputError(
      `initial-dispatch-rehearsal-missing: ${missing.length} command(s) without evidence: ${missing.join(' | ')}`,
    )
  return {
    schemaVersion: 1,
    status: 'STRUCTURE_CHECKED',
    path,
    sha256,
    rehearsedCommands: evidence.commands.length,
    nonZeroExits: evidence.commands
      .filter(entry => entry.exitCode !== 0)
      .map(entry => ({ command: entry.command, exitCode: entry.exitCode })),
    remainingGuards: INITIAL_DISPATCH_REMAINING_GUARDS,
    next: 'The reduce owner must verify every remaining guard before recording VALIDATED. Open through the host UI only after that. Opening, human forwarding and claim readback are separate facts.',
  }
}
