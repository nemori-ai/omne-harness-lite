import { FILES, type ScannedFile } from './scope.ts'

/**
 * The stylesheets the gates read: rules with their at-rule context and declarations, the class names a selector
 * names, and the calls inside a value. Scripts are read by `script-text.ts`.
 */

/** The scanned stylesheets. */
export const STYLESHEETS: readonly ScannedFile[] = FILES.filter(file => file.kind === 'css')

/** Collapses whitespace and drops it around `(`, `)`, `,` and `/`; numbers keep their original spelling. */
export const normalise = (value: string): string =>
  value
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),/])\s*/g, '$1')
    .trim()

export const stripCssComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '))

export interface CssDeclaration {
  readonly property: string
  readonly value: string
}

export interface CssRule {
  /** The prelude, normalised: a selector list, or `@property --x`, `@font-face`, `@theme inline`. */
  readonly selector: string
  /** Enclosing at-rule preludes, outermost first, normalised: `@media (min-width:768px)`, `@keyframes x`. */
  readonly context: readonly string[]
  readonly declarations: readonly CssDeclaration[]
}

const CONTAINERS = /^@(?:media|supports|layer|container|scope|starting-style|keyframes)\b/

function skipString(text: string, start: number): number {
  const quote = text[start]
  let index = start + 1
  while (index < text.length && text[index] !== quote) index += text[index] === '\\' ? 2 : 1
  return index + 1
}

function skipParentheses(text: string, start: number): number {
  let depth = 0
  let index = start
  while (index < text.length) {
    const char = text[index]!
    if (char === '"' || char === "'") {
      index = skipString(text, index)
      continue
    }
    if (char === '(') depth += 1
    else if (char === ')' && --depth === 0) return index + 1
    index += 1
  }
  return index
}

function closingBrace(text: string, open: number): number {
  let depth = 0
  let index = open
  while (index < text.length) {
    const char = text[index]!
    if (char === '"' || char === "'") {
      index = skipString(text, index)
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}' && --depth === 0) return index
    index += 1
  }
  return text.length
}

function declaration(segment: string): CssDeclaration | undefined {
  const match = /^\s*(--[\w-]+|-?[a-zA-Z][\w-]*)\s*:([\s\S]*)$/.exec(segment)
  if (match === null) return undefined
  return {
    property: match[1]!,
    value: match[2]!
      .replace(/\s*!important\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim(),
  }
}

/**
 * Every rule of one stylesheet, in the order its block closes: qualified rules (nested ones and empty ones included)
 * and the blocks of `@property`, `@font-face`, `@theme` and keyframe selectors; grouping at-rules are flattened
 * into `context`.
 */
export function cssRules(source: string): CssRule[] {
  const text = stripCssComments(source)
  const rules: CssRule[] = []
  const walk = (start: number, end: number, selector: string, context: string[]): void => {
    const declarations: CssDeclaration[] = []
    let segment = start
    let index = start
    while (index < end) {
      const char = text[index]!
      if (char === '"' || char === "'") index = skipString(text, index)
      else if (char === '(') index = skipParentheses(text, index)
      else if (char === ';') {
        const found = declaration(text.slice(segment, index))
        if (found !== undefined) declarations.push(found)
        segment = index += 1
      } else if (char === '{') {
        const close = closingBrace(text, index)
        const prelude = normalise(text.slice(segment, index))
        if (CONTAINERS.test(prelude)) walk(index + 1, close, '', [...context, prelude])
        else walk(index + 1, close, prelude, context)
        segment = index = close + 1
      } else index += 1
    }
    const last = declaration(text.slice(segment, end))
    if (last !== undefined) declarations.push(last)
    if (selector !== '') rules.push({ selector, context, declarations })
  }
  walk(0, text.length, '', [])
  return rules
}

/** The value of the last declaration of `property` in a rule, as the cascade inside one block reads it. */
export const valueOf = (rule: CssRule, property: string): string | undefined =>
  rule.declarations.findLast(found => found.property === property)?.value

/** `name(…)` calls inside a value, each with its balanced parentheses. */
export function callsIn(value: string, name: RegExp): string[] {
  const found: string[] = []
  const pattern = new RegExp(`(?<![\\w-])(?:${name.source})\\(`, 'g')
  for (const match of value.matchAll(pattern)) {
    const open = match.index + match[0].length - 1
    found.push(value.slice(match.index, skipParentheses(value, open)))
  }
  return found
}

/** The class names a selector names, outside attribute selectors and strings. */
export function selectorClasses(selector: string): string[] {
  const bare = selector.replaceAll(/\[[^\]]*\]/gu, '').replaceAll(/(["'])(?:\\.|(?!\1).)*\1/gu, '')
  return [...bare.matchAll(/\.((?:\\.|[\w-])+)/gu)]
    .map(match => (match[1] ?? '').replaceAll(/\\(.)/gu, '$1'))
    .filter(name => /^-?[_a-zA-Z]/u.test(name))
}
