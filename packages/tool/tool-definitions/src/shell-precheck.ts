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

const SEPARATORS = new Set([';', '\n', '&', '|'])
const BREAKS = new Set([' ', '\t', ';', '\n', '&', '|', '<', '>', '(', ')'])
const GLOBS = new Set(['*', '?', '[', '{', '}'])
const QUOTED_ESCAPES = new Set(['$', '`', '"', '\\', '\n'])
const OPAQUE: ShellWord = Object.freeze({ kind: 'opaque' })

type Part = Readonly<{ text: string; opaque: boolean; next: number }>

const substitution = (script: string, at: number) =>
  script[at] === '`' || (script[at] === '$' && script[at + 1] === '(')

function doubleQuoted(script: string, at: number): Part | undefined {
  let text = ''
  let opaque = false
  for (let i = at; i < script.length; i += 1) {
    if (script[i] === '"') return { text, opaque, next: i + 1 }
    if (substitution(script, i)) return undefined
    opaque ||= script[i] === '$'
    const escaped = script[i] === '\\' && QUOTED_ESCAPES.has(script[i + 1] ?? '')
    if (escaped) i += 1
    if (!escaped || script[i] !== '\n') text += script[i]
  }
  return undefined
}

/** One part of a word: an escape, a quoted run or a plain character. Undefined: what this does not read. */
function part(script: string, at: number): Part | undefined {
  const char = script[at] ?? ''
  if (char === '\\') {
    const escaped = script[at + 1]
    if (escaped === undefined) return undefined
    return { text: escaped === '\n' ? '' : escaped, opaque: false, next: at + 2 }
  }
  if (char === "'") {
    const close = script.indexOf("'", at + 1)
    return close < 0
      ? undefined
      : { text: script.slice(at + 1, close), opaque: false, next: close + 1 }
  }
  if (char === '"') return doubleQuoted(script, at + 1)
  if (substitution(script, at)) return undefined
  return { text: char, opaque: char === '$' || GLOBS.has(char), next: at + 1 }
}

type Word = Readonly<{ text: string; opaque: boolean }>

function word(script: string, at: number): Readonly<{ value: Word; next: number }> | undefined {
  let text = ''
  let opaque = false
  let i = at
  while (i < script.length && !BREAKS.has(script[i] ?? '')) {
    const next = part(script, i)
    if (next === undefined) return undefined
    // A `~` that is quoted or escaped names a file, not the home: such a word is not judged.
    opaque ||= next.opaque || (i === at && script[i] !== '~' && next.text.startsWith('~'))
    text += next.text
    i = next.next
  }
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
  const next = i + op.length
  const dup = op.endsWith('&') ? /^(?:[0-9]+|-)/u.exec(script.slice(next)) : null
  if (dup !== null) return { effect: 'none', next: next + dup[0].length }
  if (op === '<<<') return { effect: 'string', next }
  return { effect: op === '<' || op === '<&' ? 'read' : 'write', next }
}

class Words {
  readonly list: ShellWord[] = []
  #atCommand = true
  #pending: FileEffect | 'string' | undefined

  get done(): boolean {
    return this.#pending === undefined
  }

  redirect(effect: Redirect['effect']): boolean {
    if (!this.done) return false
    if (effect !== 'none') this.#pending = effect
    return true
  }

  separate(): boolean {
    this.#atCommand = true
    return this.done
  }

  add({ text, opaque }: Word): void {
    const pending = this.#pending
    this.#pending = undefined
    if (pending === 'string') return
    if (pending !== undefined)
      this.list.push(opaque ? OPAQUE : { kind: 'redirect', effect: pending, text })
    else {
      this.list.push(
        opaque
          ? OPAQUE
          : { kind: 'literal', text, position: this.#atCommand ? 'command' : 'argument' },
      )
      this.#atCommand = false
    }
  }
}

function step(script: string, at: number, words: Words): number | undefined {
  const char = script[at] ?? ''
  if (char === ' ' || char === '\t') return at + 1
  if (char === '\\' && script[at + 1] === '\n') return at + 2
  if (char === '#') return script.includes('\n', at) ? script.indexOf('\n', at) : script.length
  if (char === '(' || char === ')') return undefined
  const operator = redirect(script, at)
  if (operator === undefined) return undefined
  if (operator !== 'none') return words.redirect(operator.effect) ? operator.next : undefined
  if (SEPARATORS.has(char)) return words.separate() ? at + 1 : undefined
  const scanned = word(script, at)
  if (scanned !== undefined) words.add(scanned.value)
  return scanned?.next
}

/** The words of a POSIX script, each with where it stands. Undefined: it uses what this does not read. */
export function shellWords(script: string): readonly ShellWord[] | undefined {
  const words = new Words()
  for (let i: number | undefined = 0; i < script.length;) {
    i = step(script, i, words)
    if (i === undefined) return undefined
  }
  return words.done ? words.list : undefined
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
  const { scope, cwd } = input
  if (scope.read === undefined && scope.write === undefined) return START
  if (!withinScope(scope, 'write', cwd)) return { kind: 'outside', path: cwd, effect: 'write' }
  for (const word of (input.posix ? shellWords(input.script) : undefined) ?? []) {
    const verdict = judged(word, input)
    if (verdict !== undefined) return verdict
  }
  return START
}

function judged(
  word: ShellWord,
  at: Readonly<{ scope: FilesScope; cwd: string; home: string | undefined }>,
): PrecheckVerdict | undefined {
  if (word.kind === 'opaque' || (word.kind === 'literal' && word.position === 'command'))
    return undefined
  const path = resolved(word.text, at.cwd, at.home)
  if (path === undefined || device(path)) return undefined
  if (word.kind === 'literal' && !namesPath(word.text, path, at.cwd)) return undefined
  const effect = word.kind === 'redirect' ? word.effect : 'read'
  return withinScope(at.scope, effect, path) ? undefined : { kind: 'outside', path, effect }
}

const POSIX_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash', 'mksh', 'yash'])

export function isPosixShell(executable: string): boolean {
  const name = (executable.split(/[\\/]/u).at(-1) ?? '').toLowerCase().replace(/\.exe$/u, '')
  return POSIX_SHELLS.has(name)
}
