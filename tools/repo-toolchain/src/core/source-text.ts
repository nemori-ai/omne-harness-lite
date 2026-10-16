// 文本规则共用的词法视图：不做类型分析，只把注释与字面量的内容从「代码」里分出来，
// 让规则不被注释里的示例、字符串里的字样误报，也让括号配对不被字面量里的括号打乱。
// 两个视图与原文等长、换行位置不变，所以任一视图里的下标都能直接换算成原文的行号。
import { dirname, join, normalize } from 'node:path/posix'
import type { SourceFile, Violation } from './rule.ts'

export interface Views {
  /** 注释换成空格；字符串、模板、正则字面量原样保留。 */
  readonly code: string
  /** 在 `code` 的基础上把字面量的**内容**换成空格（引号、反引号、`${`/`}` 与正则的斜杠保留）。 */
  readonly skeleton: string
}

const cache = new WeakMap<SourceFile, Views>()

export function viewsOf(file: SourceFile): Views {
  let views = cache.get(file)
  if (views === undefined) {
    views = analyse(file.text)
    cache.set(file, views)
  }
  return views
}

const REGEX_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
])
const DIVISION_BEFORE = /[\w$)\]'"`]/

export function analyse(text: string): Views {
  const code = text.split('')
  const skeleton = text.split('')
  const n = text.length
  const blankCode = (i: number) => {
    if (text[i] !== '\n' && text[i] !== '\r') code[i] = ' '
  }
  const blankLiteral = (i: number) => {
    if (text[i] !== '\n' && text[i] !== '\r') skeleton[i] = ' '
  }
  /** 花括号栈：`template` 表示这个 `}` 关闭的是模板里的 `${`，之后回到模板正文。 */
  const braces: ('brace' | 'template')[] = []

  /** 从模板正文的 `start` 起扫：遇到收尾反引号返回其后一位；遇到 `${` 入栈并返回 `{` 之后一位。 */
  const scanTemplate = (start: number): number => {
    let j = start
    while (j < n) {
      const ch = text[j]
      if (ch === '\\') {
        blankLiteral(j)
        if (j + 1 < n) blankLiteral(j + 1)
        j += 2
        continue
      }
      if (ch === '`') return j + 1
      if (ch === '$' && text[j + 1] === '{') {
        braces.push('template')
        return j + 2
      }
      blankLiteral(j)
      j++
    }
    return n
  }

  /** 回看上一个有效字符，判断 `/` 起的是正则字面量还是除号。 */
  const regexAllowed = (at: number): boolean => {
    let k = at - 1
    while (k >= 0 && /\s/.test(code[k] ?? '')) k--
    if (k < 0) return true
    const prev = code[k] ?? ''
    if (/[\w$]/.test(prev)) {
      let s = k
      while (s > 0 && /[\w$]/.test(code[s - 1] ?? '')) s--
      return REGEX_KEYWORDS.has(code.slice(s, k + 1).join(''))
    }
    return !DIVISION_BEFORE.test(prev)
  }

  /** 正则字面量在同一行内的收尾斜杠位置；找不到（跨行）返回 -1，按除号处理。 */
  const regexEnd = (start: number): number => {
    let j = start + 1
    let inClass = false
    while (j < n) {
      const ch = text[j]
      if (ch === '\n') return -1
      if (ch === '\\') {
        j += 2
        continue
      }
      if (inClass) {
        if (ch === ']') inClass = false
      } else if (ch === '[') inClass = true
      else if (ch === '/') return j
      j++
    }
    return -1
  }

  let i = 0
  while (i < n) {
    const c = text[i]
    const d = text[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && text[i] !== '\n') {
        blankCode(i)
        blankLiteral(i)
        i++
      }
      continue
    }
    if (c === '/' && d === '*') {
      const close = text.indexOf('*/', i + 2)
      const stop = close === -1 ? n : close + 2
      for (; i < stop; i++) {
        blankCode(i)
        blankLiteral(i)
      }
      continue
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < n && text[j] !== c && text[j] !== '\n') {
        if (text[j] === '\\') {
          blankLiteral(j)
          if (j + 1 < n) blankLiteral(j + 1)
          j += 2
          continue
        }
        blankLiteral(j)
        j++
      }
      i = j + 1
      continue
    }
    if (c === '`') {
      i = scanTemplate(i + 1)
      continue
    }
    if (c === '/' && regexAllowed(i)) {
      const end = regexEnd(i)
      if (end !== -1) {
        for (let j = i + 1; j < end; j++) blankLiteral(j)
        i = end + 1
        while (i < n && /[a-z]/.test(text[i] ?? '')) i++
        continue
      }
    }
    if (c === '{') braces.push('brace')
    else if (c === '}' && braces.pop() === 'template') {
      i = scanTemplate(i + 1)
      continue
    }
    i++
  }
  return { code: code.join(''), skeleton: skeleton.join('') }
}

/** 下标 → 1 起的行号。 */
export function lineAt(text: string, index: number): number {
  let line = 1
  for (let k = 0; k < index && k < text.length; k++) if (text[k] === '\n') line++
  return line
}

/** `skeleton[open]` 是 `(`／`[`／`{` 时，返回与它配对的收括号下标；配不上返回 -1。 */
export function matchClose(skeleton: string, open: number): number {
  let depth = 0
  for (let k = open; k < skeleton.length; k++) {
    const ch = skeleton[k]
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      if (depth === 0) return k
    }
  }
  return -1
}

/** 调用的实参列表 `(`…`)` 里第一个顶层实参的原文范围（已去掉首尾空白）；没有实参返回 undefined。 */
export function firstArgument(
  views: Views,
  open: number,
): { readonly start: number; readonly end: number; readonly text: string } | undefined {
  const close = matchClose(views.skeleton, open)
  const limit = close === -1 ? views.skeleton.length : close
  let depth = 0
  let end = limit
  for (let k = open + 1; k < limit; k++) {
    const ch = views.skeleton[k]
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    else if (ch === ',' && depth === 0) {
      end = k
      break
    }
  }
  let start = open + 1
  while (start < end && /\s/.test(views.code[start] ?? '')) start++
  while (end > start && /\s/.test(views.code[end - 1] ?? '')) end--
  if (start >= end) return undefined
  return { start, end, text: views.code.slice(start, end) }
}

/** 这个下标处的字符是代码，不在注释或字面量内容里。 */
export function isCode(views: Views, index: number): boolean {
  const ch = views.skeleton[index]
  return ch !== undefined && ch !== ' ' && ch === views.code[index]
}

/**
 * 在代码视图上跑正则，只留起点落在代码里的命中（注释与字面量内容里的字样不算）。
 * 「起点」取命中里第一个非空白字符：以行首缩进开头的模式（方法头）也照常判。
 */
export function* codeMatches(views: Views, pattern: RegExp): Generator<RegExpExecArray> {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const re = new RegExp(pattern.source, flags)
  for (let m = re.exec(views.code); m !== null; m = re.exec(views.code)) {
    const lead = /^\s*/.exec(m[0])?.[0].length ?? 0
    if (lead < m[0].length && isCode(views, m.index + lead)) yield m
    if (m[0].length === 0) re.lastIndex++
  }
}

/** 对 `include(path)` 为真的文件，在代码视图上逐个命中报违反（注释里的字样不算）。 */
export function scanCode(
  rule: string,
  files: readonly SourceFile[],
  include: (path: string) => boolean,
  pattern: RegExp,
  message: (match: RegExpExecArray) => string,
): Violation[] {
  const out: Violation[] = []
  for (const file of files) {
    if (!include(file.path)) continue
    for (const m of codeMatches(viewsOf(file), pattern)) {
      out.push({ rule, path: file.path, line: lineAt(file.text, m.index), message: message(m) })
    }
  }
  return out
}

/** 一段原文若恰是一个不含插值的字符串字面量，返回其内容；否则 undefined。 */
export function stringLiteralValue(text: string): string | undefined {
  const m = /^(['"])((?:\\.|(?!\1)[^\\\n])*)\1$/.exec(text) ?? /^`([^`$\\]*)`$/.exec(text)
  if (m === null) return undefined
  return m.length === 3 ? m[2] : m[1]
}

export interface ImportRef {
  /** 模块说明符；动态 `import(x)`／`require(x)` 的实参不是字面量时为 undefined。 */
  readonly specifier: string | undefined
  readonly index: number
}

/** 静态 import／export-from、副作用 import、动态 `import(…)` 与 `require(…)`。 */
export function importsOf(file: SourceFile): ImportRef[] {
  const views = viewsOf(file)
  const out: ImportRef[] = []
  for (const m of codeMatches(views, /\bfrom\s*(['"])([^'"\n]*)\1/)) {
    out.push({ specifier: m[2], index: m.index })
  }
  for (const m of codeMatches(views, /\bimport\s*(['"])([^'"\n]*)\1/)) {
    out.push({ specifier: m[2], index: m.index })
  }
  for (const m of codeMatches(views, /\b(?:import|require)\s*\(/)) {
    // `x.import(`／`x.require(` 是方法，不是模块加载
    if (m.index > 0 && views.code[m.index - 1] === '.') continue
    const arg = firstArgument(views, m.index + m[0].length - 1)
    out.push({ specifier: arg && stringLiteralValue(arg.text), index: m.index })
  }
  return out.sort((a, b) => a.index - b.index)
}

export interface NamedImport {
  /** 在本文件里使用的名字。 */
  readonly local: string
  /** 被导入的名字；命名空间导入为 `*`，默认导入为 `default`。 */
  readonly imported: string
  readonly specifier: string
  /** import 语句的起点。 */
  readonly index: number
}

/** 静态 import 语句绑定的本地名字。 */
export function namedImportsOf(file: SourceFile): NamedImport[] {
  const views = viewsOf(file)
  const out: NamedImport[] = []
  for (const m of codeMatches(
    views,
    /\bimport\s+(?:type\s+)?([^'";]*?)\bfrom\s*(['"])([^'"\n]*)\2/,
  )) {
    const clause = m[1] ?? ''
    const specifier = m[3] ?? ''
    const index = m.index
    const namespace = /\*\s*as\s+([\w$]+)/.exec(clause)
    if (namespace?.[1] !== undefined) {
      out.push({ local: namespace[1], imported: '*', specifier, index })
    }
    const braces = /\{([^}]*)\}/.exec(clause)
    if (braces?.[1] !== undefined) {
      for (const part of braces[1].split(',')) {
        const spec = /^\s*(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(part)
        if (spec?.[1] !== undefined) {
          out.push({ local: spec[2] ?? spec[1], imported: spec[1], specifier, index })
        }
      }
    }
    const defaultName = /^\s*([\w$]+)\s*(?:,|$)/.exec(clause)
    if (defaultName?.[1] !== undefined && defaultName[1] !== 'type') {
      out.push({ local: defaultName[1], imported: 'default', specifier, index })
    }
  }
  return out
}

/** 相对说明符按文件位置解析成扫描根下的路径；非相对的原样返回 undefined。 */
export function resolveRelative(fromPath: string, specifier: string): string | undefined {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return undefined
  return normalize(join(dirname(fromPath), specifier))
}

/** 去掉模块扩展名，便于把 `./x.ts`、`./x.js`、`./x` 当成同一个模块比对。 */
export function withoutExtension(path: string): string {
  return path.replace(/\.(?:ts|js|mts|mjs|cts|cjs)$/, '')
}

export interface FunctionBody {
  readonly name: string
  /** 返回类型标注的原文（没有标注为空串）。 */
  readonly returnType: string
  /** 函数体 `{` 与配对 `}` 的下标。 */
  readonly open: number
  readonly close: number
}

/**
 * 找出有块体的函数：函数声明、类方法与对象方法、赋给名字的箭头函数与函数表达式。
 * 无名的回调（例如 `storage.write(async tx => { … })`）不在这里，由 {@link blockBodies} 覆盖。
 */
export function namedFunctionBodies(file: SourceFile): FunctionBody[] {
  const views = viewsOf(file)
  const out: FunctionBody[] = []
  const heads = [
    /\bfunction\s*\*?\s*([\w$]+)\s*(?:<[^>(]*>)?\s*\(/,
    /^[ \t]*(?:(?:public|private|protected|static|override|async|readonly)\s+)*#?([\w$]+)\s*(?:<[^>(]*>)?\s*\(/m,
    /\b([\w$]+)\s*[:=]\s*(?:async\s*)?(?:function\b[^(]*)?\(/,
  ]
  const seen = new Set<number>()
  for (const head of heads) {
    for (const m of codeMatches(views, head)) {
      const name = m[1]
      if (name === undefined || KEYWORDS.has(name)) continue
      const paramsOpen = m.index + m[0].length - 1
      const paramsClose = matchClose(views.skeleton, paramsOpen)
      if (paramsClose === -1) continue
      const body = bodyAfterParams(views, paramsClose)
      if (body === undefined || seen.has(body.open)) continue
      seen.add(body.open)
      out.push({ name, ...body })
    }
  }
  return out
}

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return', 'function'])

/** 形参 `)` 之后：可选的返回类型，然后是 `{`（或箭头 `=> {`）。不是块体返回 undefined。 */
function bodyAfterParams(
  views: Views,
  paramsClose: number,
): { returnType: string; open: number; close: number } | undefined {
  const s = views.skeleton
  let k = paramsClose + 1
  while (k < s.length && /\s/.test(s[k] ?? '')) k++
  let returnType = ''
  if (s[k] === ':') {
    const typeStart = k + 1
    let angle = 0
    let depth = 0
    for (k = typeStart; k < s.length; k++) {
      const ch = s[k]
      if (ch === '<') angle++
      else if (ch === '>' && s[k - 1] !== '=') angle--
      else if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') depth--
      else if (angle === 0 && depth === 0 && (ch === '{' || (ch === '=' && s[k + 1] === '>'))) break
      else if (angle === 0 && depth === 0 && (ch === ';' || ch === ',' || ch === '}'))
        return undefined
    }
    returnType = views.code.slice(typeStart, k).trim()
  }
  if (s[k] === '=' && s[k + 1] === '>') {
    k += 2
    while (k < s.length && /\s/.test(s[k] ?? '')) k++
  }
  if (s[k] !== '{') return undefined
  const close = matchClose(s, k)
  if (close === -1) return undefined
  return { returnType, open: k, close }
}

/** `index` 落在 `body` 之内、且不在它里面嵌套的另一个函数体之内。 */
export function inOwnBody(
  body: { readonly open: number; readonly close: number },
  nested: readonly { readonly open: number; readonly close: number }[],
  index: number,
): boolean {
  if (index <= body.open || index >= body.close) return false
  return !nested.some(
    n => n.open > body.open && n.close < body.close && n.open < index && index < n.close,
  )
}

/** 全部箭头函数与函数表达式的块体范围（含无名回调），用于把嵌套函数从外层函数体里扣掉。 */
export function blockBodies(file: SourceFile): { readonly open: number; readonly close: number }[] {
  const views = viewsOf(file)
  const out: { open: number; close: number }[] = []
  for (const m of codeMatches(views, /=>\s*\{/)) {
    const open = m.index + m[0].length - 1
    const close = matchClose(views.skeleton, open)
    if (close !== -1) out.push({ open, close })
  }
  for (const m of codeMatches(views, /\bfunction\b[^(]*\(/)) {
    const paramsClose = matchClose(views.skeleton, m.index + m[0].length - 1)
    if (paramsClose === -1) continue
    const body = bodyAfterParams(views, paramsClose)
    if (body !== undefined) out.push({ open: body.open, close: body.close })
  }
  return out
}
