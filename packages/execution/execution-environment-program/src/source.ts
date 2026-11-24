import { transformSync } from 'amaro'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'

export type PreparedProgram =
  | Readonly<{ kind: 'ready'; code: string; head: number }>
  | Readonly<{ kind: 'syntax'; message: string; line: number | null }>

/** The one function of the engine the program's calls go through, and the engine helpers a program does not get. */
export const HOST_CALL = '__call'
const HIDDEN = [HOST_CALL, '__r', 'ALL_TOOLS', 'text', 'image', 'exit', 'store', 'load']
const WRAP = 'async function __p(){'

const HELPERS = `const host = ${HOST_CALL}, fail = Object.create(null);
const raise = (e, at) => { const C = e && fail[e.__failure]; if (!C) return e; const { __failure, ...own } = e; const x = new C(e.message, own); x.stack = at.stack; return x };
const entry = name => argument => { const at = new Error(name); return host(name, argument).then(undefined, e => { throw raise(e, at) }) };
const key = k => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? "." + k : "[" + JSON.stringify(k) + "]";
const bad = (v, p, seen) => { const t = typeof v;
 if (v === null || t === "string" || t === "boolean") return null;
 if (t === "number") return Number.isFinite(v) ? null : p + " (" + v + ")";
 if (t !== "object") return p + " (" + t + ")";
 if (seen.includes(v)) return p + " (circular)";
 const next = [...seen, v];
 if (typeof v.toJSON === "function") return bad(v.toJSON(), p, next);
 if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = bad(v[i], p + "[" + i + "]", next); if (r) return r } return null }
 const proto = Object.getPrototypeOf(v);
 if (proto !== null && proto !== Object.prototype) return p + " (" + ((proto.constructor && proto.constructor.name) || "object") + ")";
 for (const k of Object.keys(v)) { if (v[k] === undefined) continue; const r = bad(v[k], p + key(k), next); if (r) return r }
 return null };
const done = v => { if (v === undefined) return { none: true }; const b = bad(v, "$", []); return b === null ? { value: v } : { bad: b } };`

function grouped(entries: readonly string[]): ReadonlyMap<string, readonly string[] | null> {
  const roots = new Map<string, string[] | null>()
  for (const name of entries) {
    const [root = '', member] = name.split('.')
    if (member === undefined) roots.set(root, null)
    else roots.set(root, [...(roots.get(root) ?? []), member])
  }
  return roots
}

/** One line, so that every line of the program keeps its number. */
function head(entries: readonly string[], failures: readonly string[], input: JsonValue): string {
  const roots = grouped(entries)
  const text = (value: string) => JSON.stringify(value)
  const tools = [...roots].map(([root, members]) =>
    members === null
      ? `${root}: entry(${text(root)})`
      : `${root}: Object.freeze({ ${members.map(m => `${m}: entry(${text(`${root}.${m}`)})`).join(', ')} })`,
  )
  const classes = failures.map(
    name =>
      `fail[${text(name)}] = class ${name} extends Error { constructor(m, own) { super(m); Object.assign(this, own); } }; fail[${text(name)}].prototype.name = ${text(name)};`,
  )
  const helpers = `${HELPERS} ${classes.join(' ')} return { tools: Object.freeze({ ${tools.join(', ')} }), fail, done, input: JSON.parse(${text(writeJsonText(input))}) };`
  const names = ['tools', 'input', ...roots.keys(), ...failures, ...HIDDEN]
  return `const __r = (() => { ${helpers.replaceAll('\n', ' ')} })(); return (async (${names.join(', ')}) => {`
}

function tail(entries: readonly string[], failures: readonly string[]): string {
  const given = [
    '__r.tools',
    '__r.input',
    ...[...grouped(entries).keys()].map(root => `__r.tools.${root}`),
    ...failures.map(name => `__r.fail.${name}`),
  ]
  return `\n})(${given.join(', ')}).then(__r.done)`
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function erased(source: string): string | Extract<PreparedProgram, { kind: 'syntax' }> {
  try {
    return transformSync(`${WRAP}${source}\n}`, { mode: 'strip-only' }).code.slice(WRAP.length, -2)
  } catch (error) {
    const line =
      isRecord(error) && typeof error['startLine'] === 'number' ? error['startLine'] : null
    const message = error instanceof Error ? error.message : String(error)
    return { kind: 'syntax', message, line }
  }
}

/** Types are erased in place: a position in the program is the same position in what runs. */
export function prepareProgram(
  source: string,
  entries: readonly string[],
  failures: readonly string[],
  input: JsonValue,
): PreparedProgram {
  const body = erased(source)
  if (typeof body !== 'string') return body
  const first = head(entries, failures, input)
  return { kind: 'ready', code: `${first}${body}${tail(entries, failures)}`, head: first.length }
}

const FRAME = /codemode\.js:(\d+):(\d+)/g

/** The line of the first frame that lies in the program, not in the line-one head. */
export function programLine(stack: string | undefined, headLength: number): number | null {
  for (const frame of (stack ?? '').matchAll(FRAME)) {
    const line = Number(frame[1])
    if (line > 1 || Number(frame[2]) > headLength) return line
  }
  return null
}

/** A parse error of the engine has one frame and no function in it. */
export function isParseStack(stack: string | undefined): boolean {
  return /^[^\n]*\n\s+at codemode\.js:\d+:\d+\s*$/.test(stack ?? '')
}
