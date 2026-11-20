import { readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { parseSync } from 'vite'

import { FILES, REPOSITORY, type ScannedFile } from './scope.ts'

/** A node of the ESTree that the parser gives back; only the fields a gate reads are named. */
export interface SyntaxNode {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly [field: string]: unknown
}

/** A key for the ratchet: a repository path and a normalised value, never a line number. */
export function violation(path: string, value: string): string {
  return `${path} | ${value}`
}

function isNode(value: unknown): value is SyntaxNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

/** The parsed module; the file name's extension picks TypeScript or TSX. A file that does not parse fails the gate. */
export function parseModule(path: string, text: string): SyntaxNode {
  const result = parseSync(path, text)
  if (result.errors.length > 0)
    throw new Error(
      `${path} does not parse: ${result.errors.map(error => error.message).join('; ')}`,
    )
  return result.program as unknown as SyntaxNode
}

const parsed = new Map<string, SyntaxNode>()

/** The scanned file's module, parsed once per test file. */
export function moduleOf(file: ScannedFile): SyntaxNode {
  const known = parsed.get(file.path)
  if (known !== undefined) return known
  const tree = parseModule(file.path, file.text)
  parsed.set(file.path, tree)
  return tree
}

/** The scanned TypeScript and TSX files. */
export const SCRIPTS: readonly ScannedFile[] = FILES.filter(
  file => file.kind === 'ts' || file.kind === 'tsx',
)

/** The scanned stylesheets. */
export const STYLESHEETS: readonly ScannedFile[] = FILES.filter(file => file.kind === 'css')

function children(node: SyntaxNode): SyntaxNode[] {
  const found: SyntaxNode[] = []
  for (const [key, value] of Object.entries(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue
    if (Array.isArray(value)) for (const item of value) if (isNode(item)) found.push(item)
    if (isNode(value)) found.push(value)
  }
  return found
}

/** Visits every node depth first; `ancestors` runs from the root to the node's parent. */
export function visit(
  root: SyntaxNode,
  enter: (node: SyntaxNode, ancestors: readonly SyntaxNode[]) => void,
): void {
  const ancestors: SyntaxNode[] = []
  const step = (node: SyntaxNode): void => {
    enter(node, ancestors)
    ancestors.push(node)
    for (const child of children(node)) step(child)
    ancestors.pop()
  }
  step(root)
}

export function field(node: SyntaxNode, name: string): SyntaxNode | undefined {
  const value = node[name]
  return isNode(value) ? value : undefined
}

export function nodes(node: SyntaxNode, name: string): SyntaxNode[] {
  const value = node[name]
  return Array.isArray(value) ? value.filter(isNode) : []
}

/** The text of a JSX tag or attribute name: `button`, `SheetPrimitive.Close`, `aria-expanded`. */
export function jsxName(name: SyntaxNode | undefined): string {
  if (name === undefined) return ''
  if (name.type === 'JSXIdentifier' || name.type === 'Identifier') return String(name['name'])
  if (name.type === 'JSXMemberExpression')
    return `${jsxName(field(name, 'object'))}.${jsxName(field(name, 'property'))}`
  if (name.type === 'JSXNamespacedName')
    return `${jsxName(field(name, 'namespace'))}:${jsxName(field(name, 'name'))}`
  return ''
}

/** A lower-case JSX tag is a DOM element; a capitalised or dotted one is a component. */
export function isIntrinsic(tag: string): boolean {
  return /^[a-z][\w-]*$/u.test(tag)
}

export function attributes(opening: SyntaxNode): SyntaxNode[] {
  return nodes(opening, 'attributes').filter(node => node.type === 'JSXAttribute')
}

export function attribute(opening: SyntaxNode, name: string): SyntaxNode | undefined {
  return attributes(opening).find(node => jsxName(field(node, 'name')) === name)
}

/** The string a JSX attribute holds literally (`a="x"` or `a={'x'}`), if it holds one. */
export function attributeString(opening: SyntaxNode, name: string): string | undefined {
  const found = attribute(opening, name)
  const value = found === undefined ? undefined : field(found, 'value')
  const literal = value?.type === 'JSXExpressionContainer' ? field(value, 'expression') : value
  return literal !== undefined && isString(literal) ? String(literal['value']) : undefined
}

export function isString(node: SyntaxNode): boolean {
  return node.type === 'Literal' && typeof node['value'] === 'string'
}

/** The cooked text of each part of a template literal. */
export function templateParts(node: SyntaxNode): string[] {
  return nodes(node, 'quasis').map(part => {
    const value = part['value'] as { cooked?: string | null; raw: string }
    return value.cooked ?? value.raw
  })
}

/** The name an import or export specifier refers to: the identifier or the string. */
export function specifierName(node: SyntaxNode | undefined): string {
  if (node === undefined) return ''
  return node.type === 'Literal' ? String(node['value']) : String(node['name'])
}

/** A qualified CSS rule: its selector as written, and the declarations directly in its block. */
export interface CssRule {
  readonly selector: string
  readonly declarations: string
}

/** At-rules whose block holds rules; every other at-rule's block holds declarations or keyframes and is skipped. */
const GROUPING_AT_RULES = new Set([
  'media',
  'supports',
  'layer',
  'container',
  'scope',
  'starting-style',
])

function closingBrace(text: string, open: number): number {
  let depth = 0
  let quote: string | undefined
  for (let index = open; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== undefined) {
      if (char === '\\') index += 1
      else if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") quote = char
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return text.length
}

function readBlock(text: string, rules: CssRule[]): string {
  const declarations: string[] = []
  let start = 0
  let quote: string | undefined
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== undefined) {
      if (char === '\\') index += 1
      else if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") quote = char
    else if (char === ';') {
      declarations.push(text.slice(start, index).trim())
      start = index + 1
    } else if (char === '{') {
      const prelude = text.slice(start, index).trim()
      const close = closingBrace(text, index)
      const inner = text.slice(index + 1, close)
      const atRule = /^@([\w-]+)/u.exec(prelude)
      if (atRule === null) rules.push({ selector: prelude, declarations: readBlock(inner, rules) })
      else if (GROUPING_AT_RULES.has(atRule[1] ?? '')) readBlock(inner, rules)
      index = close
      start = close + 1
    }
  }
  const tail = text.slice(start).trim()
  if (tail !== '') declarations.push(tail)
  return declarations.filter(declaration => declaration !== '').join('; ')
}

/** Every qualified rule in a stylesheet, nested ones included, in source order of their closing brace. */
export function cssRules(stylesheet: string): CssRule[] {
  const rules: CssRule[] = []
  readBlock(stylesheet.replaceAll(/\/\*[\s\S]*?\*\//gu, ''), rules)
  return rules
}

/** The class names a selector names, outside attribute selectors and strings. */
export function selectorClasses(selector: string): string[] {
  const bare = selector.replaceAll(/\[[^\]]*\]/gu, '').replaceAll(/(["'])(?:\\.|(?!\1).)*\1/gu, '')
  return [...bare.matchAll(/\.((?:\\.|[\w-])+)/gu)]
    .map(match => (match[1] ?? '').replaceAll(/\\(.)/gu, '$1'))
    .filter(name => /^-?[_a-zA-Z]/u.test(name))
}

/** The repository directory of a scanned member: the part of a file's path before its `src/`. */
function memberRoot(member: string): string {
  const file = FILES.find(candidate => candidate.member === member)
  if (file === undefined) throw new Error(`no scanned file belongs to ${member}`)
  return file.path.slice(0, file.path.indexOf('/src/'))
}

interface Manifest {
  readonly name: string
  readonly exports?: Readonly<Record<string, unknown>>
}

/** A scanned member's package subpath (`@omne-harness/x/y.css`) to the repository path of the file it exports. */
export function packageExports(): ReadonlyMap<string, string> {
  const found = new Map<string, string>()
  for (const member of new Set(FILES.map(file => file.member))) {
    const root = memberRoot(member)
    const manifest = JSON.parse(
      readFileSync(join(REPOSITORY, root, 'package.json'), 'utf8'),
    ) as Manifest
    for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
      if (typeof target !== 'string') continue
      found.set(join(manifest.name, subpath), normalize(join(root, target)))
    }
  }
  return found
}

/** The repository path an import specifier names: relative to the importing file, or a scanned member's export. */
export function resolveImport(
  from: string,
  specifier: string,
  exported: ReadonlyMap<string, string>,
): string | undefined {
  const bare = specifier.replace(/[?#].*$/u, '')
  if (bare.startsWith('.')) return normalize(join(dirname(from), bare))
  return exported.get(bare)
}
