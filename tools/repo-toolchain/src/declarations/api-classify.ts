// 契约 API 快照的差异粗分类：none、additive、review。
// 只新增导出、只给接口或对象类型加可选成员是 additive；删除、改签名、加必填成员与其余一切改动是 review。
// 这是粗分类：它不区分写方与读方（见 docs/engineering/integration.md「可加改动」），拿不准一律 review。
import ts from '@typescript/typescript6'
import { SECTION_AUGMENTATION, SECTION_INTERNAL } from './api-snapshot.ts'

export const API_CHANGES = ['none', 'additive', 'review'] as const
export type ApiChange = (typeof API_CHANGES)[number]

export interface ItemDifference {
  readonly section: string
  /** 项的标题，例如 `` `Foo` ``；整份快照增删时为空串。 */
  readonly item: string
  readonly kind: 'added' | 'removed' | 'changed'
  readonly change: Exclude<ApiChange, 'none'>
}

export interface SnapshotDifference {
  readonly change: ApiChange
  readonly items: readonly ItemDifference[]
}

interface Item {
  /** `###` 一行里名字之后的标注（改名、仅类型）。 */
  readonly heading: string
  readonly code: string
}

type Sections = Map<string, Map<string, Item>>

export function strongest(changes: readonly ApiChange[]): ApiChange {
  return changes.reduce<ApiChange>(
    (a, b) => (API_CHANGES.indexOf(b) > API_CHANGES.indexOf(a) ? b : a),
    'none',
  )
}

/** 读回 `api-snapshot.ts` 写出的快照：`##` 是节，`###` 是项，项的正文是一个 ts 代码块。 */
export function parseSnapshot(text: string): Sections {
  const sections: Sections = new Map()
  let section: Map<string, Item> | undefined
  let item: { name: string; heading: string; code: string[] } | undefined
  let inCode = false
  const close = () => {
    if (item !== undefined && section !== undefined)
      section.set(item.name, { heading: item.heading, code: item.code.join('\n') })
    item = undefined
  }
  for (const line of text.split('\n')) {
    if (inCode) {
      if (line === '```') inCode = false
      else item?.code.push(line)
      continue
    }
    if (line.startsWith('## ')) {
      close()
      section = new Map()
      sections.set(line.slice(3), section)
    } else if (line.startsWith('### ')) {
      close()
      const heading = line.slice(4)
      const name = /^`[^`]*`( · \S+)?/u.exec(heading)?.[0] ?? heading
      item = { name, heading: heading.slice(name.length), code: [] }
    } else if (line === '```ts') inCode = true
  }
  close()
  return sections
}

const isAugmentation = (section: string) => section.startsWith(SECTION_AUGMENTATION + ' ')

/** 比较两份快照；`before` 或 `after` 缺失表示那一侧没有快照文件。 */
export function classifySnapshots(
  before: string | undefined,
  after: string | undefined,
): SnapshotDifference {
  if (before === undefined && after === undefined) return { change: 'none', items: [] }
  if (before === undefined)
    return {
      change: 'additive',
      items: [{ section: '', item: '', kind: 'added', change: 'additive' }],
    }
  if (after === undefined)
    return {
      change: 'review',
      items: [{ section: '', item: '', kind: 'removed', change: 'review' }],
    }
  const old = parseSnapshot(before)
  const next = parseSnapshot(after)
  const items: ItemDifference[] = []
  const titles = [...new Set([...old.keys(), ...next.keys()])].sort()
  for (const title of titles) {
    const a = old.get(title) ?? new Map<string, Item>()
    const b = next.get(title) ?? new Map<string, Item>()
    for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const difference = classifyItem(title, a.get(name), b.get(name))
      if (difference !== undefined) items.push({ section: title, item: name, ...difference })
    }
  }
  return { change: strongest(items.map(item => item.change)), items }
}

function classifyItem(
  section: string,
  before: Item | undefined,
  after: Item | undefined,
): Pick<ItemDifference, 'kind' | 'change'> | undefined {
  if (before === undefined && after === undefined) return undefined
  if (after === undefined) {
    // 内部引用消失：要么引用它的公开声明变了（那一项另有分类），要么它改成了导出。
    return { kind: 'removed', change: section === SECTION_INTERNAL ? 'additive' : 'review' }
  }
  if (before === undefined) {
    // 扩充一个别人的接口，就是给它加成员：按与空接口的差异分类。
    if (!isAugmentation(section)) return { kind: 'added', change: 'additive' }
    const change = compareCode(emptyLike(after.code), after.code)
    return change === 'none' ? undefined : { kind: 'added', change }
  }
  if (before.heading !== after.heading) return { kind: 'changed', change: 'review' }
  const change = compareCode(before.code, after.code)
  return change === 'none' ? undefined : { kind: 'changed', change }
}

/** 同头的空接口；不是接口时没有可比的空形状，返回空文本（于是任何内容都算新增语句）。 */
function emptyLike(code: string): string {
  const head = /^interface [^{]*\{/u.exec(code)?.[0]
  return head === undefined ? '' : `${head}\n}`
}

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed })

function parse(code: string): ts.SourceFile {
  return ts.createSourceFile('item.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

/** 结构比较两段声明文本。 */
export function compareCode(before: string, after: string): ApiChange {
  const a = parse(before)
  const b = parse(after)
  if (print(a) === print(b)) return 'none'
  return compareLists(a.statements, b.statements, statementKey)
}

function print(node: ts.Node): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())
}

function compareNodes(a: ts.Node, b: ts.Node): ApiChange {
  if (print(a) === print(b)) return 'none'
  if (a.kind !== b.kind) return 'review'
  if (ts.isInterfaceDeclaration(a) && ts.isInterfaceDeclaration(b)) {
    if (interfaceHead(a) !== interfaceHead(b)) return 'review'
    return compareLists(a.members, b.members, memberKey)
  }
  if (ts.isTypeLiteralNode(a) && ts.isTypeLiteralNode(b))
    return compareLists(a.members, b.members, memberKey)
  const left = children(a)
  const right = children(b)
  // 叶子（名字、字面量、关键字）文本不同，或子结构的个数不同（例如多了 `?`、少了参数）。
  if (left.length === 0 || left.length !== right.length) return 'review'
  return strongest(
    left.map((slot, index) => {
      const other = right[index]
      if (other === undefined || other.kind !== slot.kind) return 'review'
      if (slot.kind === 'node' && other.kind === 'node') return compareNodes(slot.node, other.node)
      if (slot.kind === 'list' && other.kind === 'list') {
        if (slot.nodes.length !== other.nodes.length) return 'review'
        return strongest(
          slot.nodes.map((node, at) => {
            const peer = other.nodes[at]
            return peer === undefined ? 'review' : compareNodes(node, peer)
          }),
        )
      }
      return 'review'
    }),
  )
}

type Slot =
  | { readonly kind: 'node'; readonly node: ts.Node }
  | { readonly kind: 'list'; readonly nodes: readonly ts.Node[] }

function children(node: ts.Node): Slot[] {
  const slots: Slot[] = []
  ts.forEachChild(
    node,
    child => {
      slots.push({ kind: 'node', node: child })
    },
    list => {
      slots.push({ kind: 'list', nodes: [...list] })
    },
  )
  return slots
}

function interfaceHead(node: ts.InterfaceDeclaration): string {
  const source = node.getSourceFile()
  const typeParameters = (node.typeParameters ?? []).map(p =>
    printer.printNode(ts.EmitHint.Unspecified, p, source),
  )
  const heritage = (node.heritageClauses ?? []).map(c =>
    printer.printNode(ts.EmitHint.Unspecified, c, source),
  )
  return `${node.name.text}<${typeParameters.join(',')}>${heritage.join(' ')}`
}

/**
 * 按键对齐两组成员或语句：删掉的键是 review；新增的键只有全部是可选成员时是 additive；
 * 同键各一个时递归比较；同键多个（重载）时按顺序比较文本，重载的先后影响解析，有出入即 review。
 */
function compareLists(
  before: readonly ts.Node[],
  after: readonly ts.Node[],
  key: (node: ts.Node) => string,
): ApiChange {
  const group = (nodes: readonly ts.Node[]) => {
    const groups = new Map<string, ts.Node[]>()
    for (const node of nodes) groups.set(key(node), [...(groups.get(key(node)) ?? []), node])
    return groups
  }
  const old = group(before)
  const next = group(after)
  const changes: ApiChange[] = []
  for (const [name, nodes] of old) if (!next.has(name) && nodes.length > 0) changes.push('review')
  for (const [name, nodes] of next) {
    const previous = old.get(name)
    if (previous === undefined) {
      changes.push(nodes.every(isOptionalMember) ? 'additive' : 'review')
      continue
    }
    const [single] = previous
    const [peer] = nodes
    if (previous.length === 1 && nodes.length === 1 && single !== undefined && peer !== undefined) {
      changes.push(compareNodes(single, peer))
      continue
    }
    const texts = (list: readonly ts.Node[]) => list.map(print).join('\n\u0000')
    changes.push(texts(previous) === texts(nodes) ? 'none' : 'review')
  }
  return strongest(changes)
}

function isOptionalMember(node: ts.Node): boolean {
  return (
    (ts.isPropertySignature(node) || ts.isMethodSignature(node)) && node.questionToken !== undefined
  )
}

function memberKey(node: ts.Node): string {
  if (ts.isPropertySignature(node) || ts.isMethodSignature(node))
    return `member:${propertyName(node.name)}`
  if (ts.isIndexSignatureDeclaration(node))
    return `index:${node.parameters.map(p => (p.type === undefined ? '' : print(p.type))).join(',')}`
  return ts.SyntaxKind[node.kind]
}

function propertyName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return print(name)
}

function statementKey(node: ts.Node): string {
  const named: ts.Node & { readonly name?: ts.Node } = node
  const name = named.name !== undefined && ts.isIdentifier(named.name) ? named.name.text : ''
  if (ts.isVariableStatement(node))
    return `variable:${node.declarationList.declarations.map(d => d.name.getText()).join(',')}`
  return `${ts.SyntaxKind[node.kind]}:${name}`
}
