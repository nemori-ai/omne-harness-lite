import { posix } from 'node:path'
import {
  segmentsBelow,
  withinScope,
  type FileEffect,
  type FilesScope,
} from '@omne-harness/execution-environment-contract'

export type ShellWord =
  | Readonly<{ kind: 'literal'; text: string; position: 'command' | 'argument' }>
  | Readonly<{ kind: 'redirect'; effect: FileEffect; text: string }>
  | Readonly<{ kind: 'opaque' }>

export type PrecheckVerdict =
  | Readonly<{ kind: 'start' }>
  | Readonly<{ kind: 'outside'; path: string; effect: FileEffect }>

type Word = Readonly<{ text: string; opaque: boolean }>
type Scanned<T> = Readonly<{ value: T; next: number }> | undefined

const SEPARATORS = new Set([';', '\n', '&', '|'])
const BREAKS = new Set([' ', '\t', ';', '\n', '&', '|', '<', '>', '(', ')'])
const GLOBS = new Set(['*', '?', '[', '{', '}'])

function doubleQuoted(script: string, at: number): Scanned<Word> {
  let text = ''
  let opaque = false
  for (let i = at; i < script.length; i += 1) {
    const char = script[i]
    if (char === '"') return { value: { text, opaque }, next: i + 1 }
    if (char === '`' || (char === '$' && script[i + 1] === '(')) return undefined
    if (char === '$') opaque = true
    if (char === '\\' && '$`"\\\n'.includes(script[i + 1] ?? '')) {
      i += 1
      if (script[i] !== '\n') text += script[i]
    } else text += char
  }
  return undefined
}

/** One word from its first character. Undefined: something this reader does not read. */
function word(script: string, at: number): Scanned<Word> {
  let text = ''
  let opaque = false
  let i = at
  while (i < script.length && !BREAKS.has(script[i] ?? '')) {
    const char = script[i] ?? ''
    if (char === '\\') {
      if (i + 1 >= script.length) return undefined
      if (script[i + 1] !== '\n') text += script[i + 1]
      i += 2
    } else if (char === "'") {
      const close = script.indexOf("'", i + 1)
      if (close < 0) return undefined
      if (i === at && script[i + 1] === '~') opaque = true
      text += script.slice(i + 1, close)
      i = close + 1
    } else if (char === '"') {
      const part = doubleQuoted(script, i + 1)
      if (part === undefined) return undefined
      if (i === at && part.value.text.startsWith('~')) opaque = true
      text += part.value.text
      opaque ||= part.value.opaque
      i = part.next
    } else if (char === '`' || (char === '$' && script[i + 1] === '(')) return undefined
    else {
      if (char === '$' || GLOBS.has(char)) opaque = true
      text += char
      i += 1
    }
  }
  if (script[i] === '(' || script[i] === ')') return undefined
  if ((text === '{' || text === '}') && i - at === 1) return undefined
  return { value: { text, opaque }, next: i }
}

type Redirect = Readonly<{ effect: FileEffect | 'none' | 'string'; next: number }>

/** A redirection operator at `at`, after any file descriptor digits. Undefined: a here-document. */
function redirect(script: string, at: number): Redirect | 'none' | undefined {
  let i = at
  while (/[0-9]/u.test(script[i] ?? '')) i += 1
  const rest = script.slice(i, i + 3)
  const op = ['&>>', '<<<', '<<', '>>', '>|', '<>', '&>', '>&', '<&', '>', '<'].find(o =>
    rest.startsWith(o),
  )
  if (op === undefined || (op.startsWith('&') && i !== at)) return 'none'
  if (op === '<<') return undefined
  let next = i + op.length
  if (op === '>&' || op === '<&') {
    const dup = /^(?:[0-9]+|-)/u.exec(script.slice(next))
    if (dup !== null) return { effect: 'none', next: next + dup[0].length }
  }
  if (op === '<<<') return { effect: 'string', next }
  return { effect: op === '<' || op === '<&' ? 'read' : 'write', next }
}

/** The words of a POSIX script, each with where it stands. Undefined: it uses what this does not read. */
export function shellWords(script: string): readonly ShellWord[] | undefined {
  const words: ShellWord[] = []
  let atCommand = true
  let pending: FileEffect | 'string' | undefined
  let i = 0
  while (i < script.length) {
    const char = script[i] ?? ''
    if (char === ' ' || char === '\t') i += 1
    else if (char === '\\' && script[i + 1] === '\n') i += 2
    else if (char === '#') while (i < script.length && script[i] !== '\n') i += 1
    else if (char === '(' || char === ')') return undefined
    else {
      const operator = redirect(script, i)
      if (operator === undefined) return undefined
      if (operator !== 'none') {
        if (pending !== undefined) return undefined
        if (operator.effect !== 'none') pending = operator.effect
        i = operator.next
        continue
      }
      if (SEPARATORS.has(char)) {
        if (pending !== undefined) return undefined
        atCommand = true
        i += 1
        continue
      }
      const scanned = word(script, i)
      if (scanned === undefined) return undefined
      i = scanned.next
      const { text, opaque } = scanned.value
      if (pending === 'string') pending = undefined
      else if (pending !== undefined) {
        words.push(opaque ? { kind: 'opaque' } : { kind: 'redirect', effect: pending, text })
        pending = undefined
      } else {
        words.push(
          opaque
            ? { kind: 'opaque' }
            : { kind: 'literal', text, position: atCommand ? 'command' : 'argument' },
        )
        atCommand = false
      }
    }
  }
  return pending === undefined ? words : undefined
}

const DEVICES = new Set([
  '/dev/null',
  '/dev/zero',
  '/dev/stdin',
  '/dev/stdout',
  '/dev/stderr',
  '/dev/tty',
])
const device = (path: string) => DEVICES.has(path) || path.startsWith('/dev/fd/')

/** The absolute path a word names from the start directory. Undefined: a home it cannot tell. */
function resolved(text: string, cwd: string, home: string | undefined): string | undefined {
  if (text === '~' || text.startsWith('~/'))
    return home === undefined ? undefined : posix.resolve(home, `.${text.slice(1)}`)
  if (text.startsWith('~')) return undefined
  return posix.resolve(cwd, text)
}

function namesPath(text: string, path: string, cwd: string): boolean {
  if (text.startsWith('/') || text.startsWith('~')) return true
  return text.split('/').includes('..') && segmentsBelow(cwd, path) === undefined
}

const START: PrecheckVerdict = Object.freeze({ kind: 'start' })

/** Whether a start may go on: its directory and the paths its script names in plain words, by the scope. */
export function precheck(
  input: Readonly<{
    scope: FilesScope
    cwd: string
    home: string | undefined
    script: string
    posix: boolean
  }>,
): PrecheckVerdict {
  const { scope, cwd, home } = input
  if (scope.read === undefined && scope.write === undefined) return START
  if (!withinScope(scope, 'write', cwd)) return { kind: 'outside', path: cwd, effect: 'write' }
  const words = input.posix ? shellWords(input.script) : undefined
  for (const word of words ?? []) {
    if (word.kind === 'opaque') continue
    if (word.kind === 'literal' && word.position === 'command') continue
    const effect = word.kind === 'redirect' ? word.effect : 'read'
    const path = resolved(word.text, cwd, home)
    if (path === undefined || device(path)) continue
    if (word.kind === 'literal' && !namesPath(word.text, path, cwd)) continue
    if (!withinScope(scope, effect, path)) return { kind: 'outside', path, effect }
  }
  return START
}

const POSIX_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash', 'mksh', 'yash'])

/** Whether a shell program is of the POSIX family, by its name. */
export function isPosixShell(executable: string): boolean {
  const name = (executable.split(/[\\/]/u).at(-1) ?? '').toLowerCase().replace(/\.exe$/u, '')
  return POSIX_SHELLS.has(name)
}
