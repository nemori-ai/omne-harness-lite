import { parseArgs } from 'node:util'

export type GovernanceAction =
  | 'center.add'
  | 'tenant.create'
  | 'tenant.add'
  | 'tenant.switch'
  | 'login'
  | 'register'
  | 'logout'
  | 'logins.list'
  | 'logins.revoke'
  | 'credential.change'
export type EntryCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'session'; readonly home: string | null; readonly session: string | null }
  | {
      readonly kind: 'message'
      readonly home: string | null
      readonly session: string | null
      readonly messageFile: string
      readonly json: true
    }
  | {
      readonly kind: 'governance'
      readonly action: GovernanceAction
      readonly home: string | null
      readonly json: boolean
      readonly interactive: boolean
      readonly values: Readonly<Record<string, string | boolean>>
    }

export class EntryUsageFailure extends Error {
  override readonly name = 'EntryUsageFailure'
  constructor(
    readonly reason: 'invalid-command' | 'invalid-options' | 'missing-input' | 'tty-required',
  ) {
    super(`omne: ${reason}`)
  }
}
interface CommandShape {
  readonly words: readonly string[]
  readonly action: GovernanceAction
  readonly positional?: string
  readonly options: readonly string[]
  readonly required: readonly string[]
}
const trustOptions = ['system-ca', 'ca-file', 'spki']
const loginOptions = ['center', 'login-identifier', 'credential-file']
const shapes: readonly CommandShape[] = [
  {
    words: ['center', 'add'],
    action: 'center.add',
    positional: 'endpoint',
    options: ['name', ...trustOptions],
    required: ['endpoint', 'name'],
  },
  { words: ['tenant', 'create'], action: 'tenant.create', options: ['name'], required: ['name'] },
  {
    words: ['tenant', 'add'],
    action: 'tenant.add',
    options: ['invitation'],
    required: ['invitation'],
  },
  {
    words: ['tenant', 'switch'],
    action: 'tenant.switch',
    positional: 'tenant',
    options: [],
    required: ['tenant'],
  },
  {
    words: ['login'],
    action: 'login',
    options: loginOptions,
    required: ['login-identifier', 'credential-file'],
  },
  {
    words: ['register'],
    action: 'register',
    options: loginOptions,
    required: ['login-identifier', 'credential-file'],
  },
  { words: ['logout'], action: 'logout', options: [], required: [] },
  { words: ['logins', 'list'], action: 'logins.list', options: [], required: [] },
  {
    words: ['logins', 'revoke'],
    action: 'logins.revoke',
    options: ['handle'],
    required: ['handle'],
  },
  {
    words: ['credential', 'change'],
    action: 'credential.change',
    options: ['current-credential-file', 'new-credential-file'],
    required: ['current-credential-file', 'new-credential-file'],
  },
]
const booleanOptions = new Set(['json', 'help', 'version', 'system-ca'])
const allOptions = [
  ...new Set([
    'home',
    'session',
    'message-file',
    ...booleanOptions,
    ...shapes.flatMap(shape => shape.options),
  ]),
]
const options = Object.fromEntries(
  allOptions.map(name => [
    name,
    { type: booleanOptions.has(name) ? ('boolean' as const) : ('string' as const) },
  ]),
)

function parseOptions(args: readonly string[]) {
  try {
    return parseArgs({
      args: [...args],
      options,
      allowPositionals: true,
      strict: true,
      tokens: true,
    })
  } catch (error) {
    if (
      error instanceof TypeError &&
      'code' in error &&
      typeof error.code === 'string' &&
      error.code.startsWith('ERR_PARSE_ARGS')
    )
      throw new EntryUsageFailure('invalid-options')
    throw error
  }
}

function checkedOptions(parsed: ReturnType<typeof parseOptions>): Set<string> {
  const names = new Set<string>()
  for (const token of parsed.tokens) {
    if (token.kind !== 'option') continue
    if (names.has(token.name)) throw new EntryUsageFailure('invalid-options')
    names.add(token.name)
    const value = parsed.values[token.name]
    if (typeof value === 'string' && (value.length === 0 || value.includes('\0')))
      throw new EntryUsageFailure('invalid-options')
  }
  return names
}

function stringOption(parsed: ReturnType<typeof parseOptions>, name: string): string | null {
  const value = parsed.values[name]
  return typeof value === 'string' ? value : null
}

function sessionCommand(
  parsed: ReturnType<typeof parseOptions>,
  seen: Set<string>,
  isTTY: boolean,
): EntryCommand {
  const allowed = new Set(['home', 'session', 'message-file', 'json'])
  if ([...seen].some(name => !allowed.has(name))) throw new EntryUsageFailure('invalid-options')
  const home = stringOption(parsed, 'home')
  const session = stringOption(parsed, 'session')
  const messageFile = stringOption(parsed, 'message-file')
  if (messageFile !== null && parsed.values['json'] === true)
    return { kind: 'message', home, session, messageFile, json: true }
  if (seen.has('message-file') || seen.has('json')) throw new EntryUsageFailure('invalid-options')
  if (!isTTY) throw new EntryUsageFailure('tty-required')
  return { kind: 'session', home, session }
}

function governanceCommand(
  parsed: ReturnType<typeof parseOptions>,
  seen: Set<string>,
  isTTY: boolean,
): EntryCommand {
  const shape = shapes.find(candidate =>
    candidate.words.every((word, index) => parsed.positionals[index] === word),
  )
  if (shape === undefined) throw new EntryUsageFailure('invalid-command')
  const allowed = new Set(['home', 'json', ...shape.options])
  if ([...seen].some(name => !allowed.has(name))) throw new EntryUsageFailure('invalid-options')
  const values = governanceValues(shape, parsed)
  const json = parsed.values['json'] === true
  checkGovernanceInput(shape, values, isTTY && !json)
  if (!isTTY && !json) throw new EntryUsageFailure('tty-required')
  return {
    kind: 'governance',
    action: shape.action,
    home: stringOption(parsed, 'home'),
    json,
    interactive: isTTY && !json,
    values,
  }
}

function governanceValues(
  shape: CommandShape,
  parsed: ReturnType<typeof parseOptions>,
): Readonly<Record<string, string | boolean>> {
  const rest = parsed.positionals.slice(shape.words.length)
  if (rest.length > (shape.positional === undefined ? 0 : 1))
    throw new EntryUsageFailure('invalid-options')
  const values: Record<string, string | boolean> = {}
  for (const name of shape.options) {
    const value = parsed.values[name]
    if (value !== undefined) values[name] = value
  }
  if (shape.positional !== undefined && rest[0] !== undefined) values[shape.positional] = rest[0]
  return values
}

function checkGovernanceInput(
  shape: CommandShape,
  values: Readonly<Record<string, string | boolean>>,
  isTTY: boolean,
): void {
  const trusts = trustOptions.filter(name => name in values)
  if (trusts.length > 1) throw new EntryUsageFailure('invalid-options')
  if (isTTY) return
  if (shape.required.some(name => !(name in values))) throw new EntryUsageFailure('missing-input')
  if (shape.action === 'center.add' && trusts.length !== 1)
    throw new EntryUsageFailure('missing-input')
}

export function parseEntryCommand(args: readonly string[], isTTY: boolean): EntryCommand {
  const parsed = parseOptions(args)
  const seen = checkedOptions(parsed)
  if (seen.has('help') || seen.has('version')) {
    if (seen.size !== 1 || parsed.positionals.length !== 0)
      throw new EntryUsageFailure('invalid-options')
    return { kind: seen.has('help') ? 'help' : 'version' }
  }
  return parsed.positionals.length === 0
    ? sessionCommand(parsed, seen, isTTY)
    : governanceCommand(parsed, seen, isTTY)
}
