import { parseSync } from 'vite'

import type { ScannedFile } from './scope.ts'

/**
 * The text the style gates read: CSS rules with their at-rule context, and the strings, calls and object
 * properties of scripts. Scripts are parsed with the oxc parser Vite ships, so comments never count and a
 * template literal is one string whose substitutions read `${…}`.
 */

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

/** Every block of one stylesheet that holds declarations, nested at-rules flattened into `context`. */
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
    if (selector !== '' && declarations.length > 0) rules.push({ selector, context, declarations })
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

export interface AstNode {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly [key: string]: unknown
}

const isNode = (value: unknown): value is AstNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string'

const trees = new Map<string, AstNode>()

/** The script's syntax tree; a file that does not parse fails the gate rather than escaping it. */
export function scriptTree(file: Pick<ScannedFile, 'path' | 'text' | 'kind'>): AstNode {
  const key = `${file.path}\0${file.text}`
  const cached = trees.get(key)
  if (cached !== undefined) return cached
  const lang = file.kind === 'tsx' ? 'tsx' : file.kind === 'js' ? 'js' : 'ts'
  const parsed = parseSync(file.path, file.text, { lang })
  if (parsed.errors.length > 0)
    throw new Error(`${file.path} does not parse: ${parsed.errors[0]!.message}`)
  const tree = parsed.program as unknown as AstNode
  trees.set(key, tree)
  return tree
}

export function walk(
  node: AstNode,
  visit: (node: AstNode, parent: AstNode | undefined) => void,
  parent?: AstNode,
): void {
  visit(node, parent)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) walk(item, visit, node)
    } else if (isNode(value)) walk(value, visit, node)
  }
}

export const child = (node: AstNode, key: string): AstNode | undefined =>
  isNode(node[key]) ? (node[key] as AstNode) : undefined

export const children = (node: AstNode, key: string): AstNode[] =>
  Array.isArray(node[key]) ? (node[key] as unknown[]).filter(isNode) : []

/** The text of a string literal or a template literal (substitutions as `${…}`); undefined for anything else. */
export function stringText(node: AstNode): string | undefined {
  if (node.type === 'Literal' && typeof node['value'] === 'string') return node['value']
  if (node.type !== 'TemplateLiteral') return undefined
  return children(node, 'quasis')
    .map(quasi => (quasi['value'] as { raw: string }).raw)
    .join('${…}')
}

/** Every string a script writes: string literals and template literals, in source order. */
export function scriptStrings(file: Pick<ScannedFile, 'path' | 'text' | 'kind'>): string[] {
  const found: string[] = []
  walk(scriptTree(file), (node, parent) => {
    if (parent?.type === 'TemplateLiteral') return
    const text = stringText(node)
    if (text !== undefined) found.push(text)
  })
  return found
}

/** The name of a property key or member: `a`, `'a'`, `a.b` gives `b`. */
export function keyName(node: AstNode | undefined): string | undefined {
  if (node === undefined) return undefined
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') return node['name'] as string
  if (node.type === 'Literal' && typeof node['value'] === 'string') return node['value']
  if (node.type === 'MemberExpression') return keyName(child(node, 'property'))
  return undefined
}

/** `name: expression` pairs of every object literal, shorthand included. */
export function objectProperties(
  tree: AstNode,
): { readonly name: string; readonly value: AstNode; readonly shorthand: boolean }[] {
  const found: { name: string; value: AstNode; shorthand: boolean }[] = []
  walk(tree, node => {
    if (node.type !== 'Property' || node['computed'] === true) return
    const name = keyName(child(node, 'key'))
    const value = child(node, 'value')
    if (name !== undefined && value !== undefined)
      found.push({ name, value, shorthand: node['shorthand'] === true })
  })
  return found
}

/** Calls whose callee is `name` or ends in `.name`. */
export function callsNamed(tree: AstNode, name: string): AstNode[] {
  const found: AstNode[] = []
  walk(tree, node => {
    if (node.type === 'CallExpression' && keyName(child(node, 'callee')) === name) found.push(node)
  })
  return found
}

/** The text of a call's argument when it is a string or template literal. */
export function stringArgument(call: AstNode, index = 0): string | undefined {
  const argument = children(call, 'arguments')[index]
  return argument === undefined ? undefined : stringText(argument)
}

/** The initialiser of the first `const` or `let` that declares `name` in the file. */
export function initialiserOf(tree: AstNode, name: string): AstNode | undefined {
  let found: AstNode | undefined
  walk(tree, node => {
    if (found !== undefined || node.type !== 'VariableDeclarator') return
    if (keyName(child(node, 'id')) === name) found = child(node, 'init')
  })
  return found
}

/** Strings written inside one expression. */
export function stringsIn(node: AstNode): string[] {
  const found: string[] = []
  walk(node, (inner, parent) => {
    if (parent?.type === 'TemplateLiteral') return
    const text = stringText(inner)
    if (text !== undefined) found.push(text)
  })
  return found
}

/** Module specifiers of static imports, dynamic imports and re-exports. */
export function importSources(tree: AstNode): string[] {
  const found: string[] = []
  walk(tree, node => {
    if (
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'ImportExpression'
    ) {
      const source = child(node, 'source')
      if (source !== undefined && typeof source['value'] === 'string') found.push(source['value'])
    }
  })
  return found
}

export interface JsxElement {
  readonly name: string
  readonly attributes: ReadonlyMap<string, AstNode | undefined>
  readonly node: AstNode
}

/** Every JSX opening element with its named attributes; a valueless attribute maps to undefined. */
export function jsxElements(tree: AstNode): JsxElement[] {
  const found: JsxElement[] = []
  walk(tree, node => {
    if (node.type !== 'JSXOpeningElement') return
    const name = child(node, 'name')
    const attributes = new Map<string, AstNode | undefined>()
    for (const attribute of children(node, 'attributes')) {
      const key = keyName(child(attribute, 'name'))
      if (attribute.type === 'JSXAttribute' && key !== undefined)
        attributes.set(key, child(attribute, 'value'))
    }
    found.push({
      name: name?.type === 'JSXIdentifier' ? (name['name'] as string) : '',
      attributes,
      node,
    })
  })
  return found
}
