import { readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

import { parseSync } from 'vite'

import { FILES, REPOSITORY, type ScannedFile } from './scope.ts'

/**
 * The scripts the gates read. They are parsed with the oxc parser Vite ships, so comments never count. One node
 * type, one walk, and the readers several gates share: strings, object properties, calls, imports, JSX, and the
 * package exports an import resolves through. Stylesheets are read by `css-text.ts`.
 */

/** A node of the ESTree the parser gives back; only the fields a gate reads are named. */
export interface SyntaxNode {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly [field: string]: unknown
}

type Script = Pick<ScannedFile, 'path' | 'text'>

function isNode(value: unknown): value is SyntaxNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

const languageOf = (path: string): 'js' | 'ts' | 'tsx' =>
  path.endsWith('.tsx') ? 'tsx' : /\.[cm]?js$/u.test(path) ? 'js' : 'ts'

/** The parsed module; the file name's extension picks JavaScript, TypeScript or TSX. A file that does not parse fails the gate. */
export function parseModule(path: string, text: string): SyntaxNode {
  const result = parseSync(path, text, { lang: languageOf(path) })
  if (result.errors.length > 0)
    throw new Error(
      `${path} does not parse: ${result.errors.map(error => error.message).join('; ')}`,
    )
  return result.program as unknown as SyntaxNode
}

const parsed = new Map<string, SyntaxNode>()

/** The script's module, parsed once per test file for each text it has. */
export function moduleOf(file: Script): SyntaxNode {
  const key = `${file.path}\0${file.text}`
  const known = parsed.get(key)
  if (known !== undefined) return known
  const tree = parseModule(file.path, file.text)
  parsed.set(key, tree)
  return tree
}

/** The scanned TypeScript and TSX files. */
export const SCRIPTS: readonly ScannedFile[] = FILES.filter(
  file => file.kind === 'ts' || file.kind === 'tsx',
)

function childNodes(node: SyntaxNode): SyntaxNode[] {
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
    for (const child of childNodes(node)) step(child)
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

/** The text of a string literal, or of a template literal as written with each substitution read `${…}`. */
export function stringText(node: SyntaxNode): string | undefined {
  if (isString(node)) return node['value'] as string
  if (node.type !== 'TemplateLiteral') return undefined
  return nodes(node, 'quasis')
    .map(quasi => (quasi['value'] as { raw: string }).raw)
    .join('${…}')
}

/** Strings written inside one expression: string literals and template literals, in source order. */
export function stringsIn(node: SyntaxNode): string[] {
  const found: string[] = []
  visit(node, (inner, ancestors) => {
    if (ancestors.at(-1)?.type === 'TemplateLiteral') return
    const text = stringText(inner)
    if (text !== undefined) found.push(text)
  })
  return found
}

/** Every string a script writes. */
export const scriptStrings = (file: Script): string[] => stringsIn(moduleOf(file))

/** The name of a property key, member or specifier: `a`, `'a'`, `a.b` gives `b`. */
export function keyName(node: SyntaxNode | undefined): string | undefined {
  if (node === undefined) return undefined
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') return node['name'] as string
  if (isString(node)) return node['value'] as string
  if (node.type === 'MemberExpression') return keyName(field(node, 'property'))
  return undefined
}

/** `name: expression` pairs of every object literal, shorthand included. */
export function objectProperties(
  tree: SyntaxNode,
): { readonly name: string; readonly value: SyntaxNode; readonly shorthand: boolean }[] {
  const found: { name: string; value: SyntaxNode; shorthand: boolean }[] = []
  visit(tree, node => {
    if (node.type !== 'Property' || node['computed'] === true) return
    const name = keyName(field(node, 'key'))
    const value = field(node, 'value')
    if (name !== undefined && value !== undefined)
      found.push({ name, value, shorthand: node['shorthand'] === true })
  })
  return found
}

/** Calls whose callee is `name` or ends in `.name`. */
export function callsNamed(tree: SyntaxNode, name: string): SyntaxNode[] {
  const found: SyntaxNode[] = []
  visit(tree, node => {
    if (node.type === 'CallExpression' && keyName(field(node, 'callee')) === name) found.push(node)
  })
  return found
}

/** The text of a call's argument when it is a string or template literal. */
export function stringArgument(call: SyntaxNode, index = 0): string | undefined {
  const argument = nodes(call, 'arguments')[index]
  return argument === undefined ? undefined : stringText(argument)
}

/** The initialiser of the first variable that declares `name` in the file. */
export function initialiserOf(tree: SyntaxNode, name: string): SyntaxNode | undefined {
  let found: SyntaxNode | undefined
  visit(tree, node => {
    if (found !== undefined || node.type !== 'VariableDeclarator') return
    if (keyName(field(node, 'id')) === name) found = field(node, 'init')
  })
  return found
}

/** Module specifiers of static imports, dynamic imports and re-exports. */
export function importSources(tree: SyntaxNode): string[] {
  const found: string[] = []
  visit(tree, node => {
    if (
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'ImportExpression'
    ) {
      const source = field(node, 'source')
      if (source !== undefined && isString(source)) found.push(source['value'] as string)
    }
  })
  return found
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

export interface JsxElement {
  readonly name: string
  readonly attributes: ReadonlyMap<string, SyntaxNode | undefined>
  readonly node: SyntaxNode
}

/** Every JSX opening element with its named attributes; a valueless attribute maps to undefined. */
export function jsxElements(tree: SyntaxNode): JsxElement[] {
  const found: JsxElement[] = []
  visit(tree, node => {
    if (node.type !== 'JSXOpeningElement') return
    const named = new Map<string, SyntaxNode | undefined>()
    for (const item of attributes(node))
      named.set(jsxName(field(item, 'name')), field(item, 'value'))
    found.push({ name: jsxName(field(node, 'name')), attributes: named, node })
  })
  return found
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
