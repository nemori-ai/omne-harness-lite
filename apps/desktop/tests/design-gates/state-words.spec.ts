// @module-tag source-text
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ratchet, tally } from './ratchet.ts'
import { isKit, KIT } from './scope.ts'
import {
  attribute,
  field,
  isString,
  jsxName,
  moduleOf,
  nodes,
  parseModule,
  SCRIPTS,
  type SyntaxNode,
  templateParts,
  violation,
  visit,
} from './source-text.ts'

/**
 * FE-I31: a state has one name, the one in the shared kit's table `STATE_LABELS`, and it reaches the page only
 * through `StateWord`. So a module or the desktop page that writes a word of that table itself is counted: a string,
 * a template part or a JSX text whose words (split at spaces and punctuation) include one of the table's values.
 * A sentence that merely contains the characters (`服务暂时不可用`) is not a state word and is not counted.
 * `StateWord` given its own text through `fact`, or its own table through `labels`, says a state outside the table
 * and is counted once.
 */
const LABELS_FILE = join(KIT, 'src/patterns/ai/state-labels.ts')

function unwrap(node: SyntaxNode | undefined): SyntaxNode | undefined {
  return node?.type === 'TSAsExpression' || node?.type === 'TSSatisfiesExpression'
    ? unwrap(field(node, 'expression'))
    : node
}

/** The Chinese values of `STATE_LABELS`, read from the kit's source. */
export function stateLabels(tree: SyntaxNode): Set<string> {
  const labels = new Set<string>()
  visit(tree, node => {
    if (node.type !== 'VariableDeclarator' || field(node, 'id')?.['name'] !== 'STATE_LABELS') return
    for (const property of nodes(unwrap(field(node, 'init')) ?? node, 'properties')) {
      const value = field(property, 'value')
      if (value !== undefined && isString(value)) labels.add(String(value['value']))
    }
  })
  return labels
}

function words(text: string): string[] {
  return text.split(/[\s\p{P}\p{S}]+/u).filter(word => word !== '')
}

/** Statements whose string is a module path, not text. */
const MODULE_PATHS = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
])

function texts(node: SyntaxNode, parent: SyntaxNode | undefined): string[] {
  if (MODULE_PATHS.has(parent?.type ?? '')) return []
  if (isString(node)) return [String(node['value'])]
  if (node.type === 'JSXText') return [String(node['value'])]
  if (node.type === 'TemplateLiteral') return templateParts(node)
  return []
}

export function selfWrittenStates(tree: SyntaxNode, labels: ReadonlySet<string>): string[] {
  const found: string[] = []
  visit(tree, (node, ancestors) => {
    for (const text of texts(node, ancestors.at(-1)))
      for (const word of words(text)) if (labels.has(word)) found.push(word)
    if (node.type !== 'JSXOpeningElement' || jsxName(field(node, 'name')) !== 'StateWord') return
    for (const own of ['fact', 'labels'])
      if (attribute(node, own) !== undefined) found.push(`StateWord ${own}`)
  })
  return found
}

function kitLabels(): Set<string> {
  const file = SCRIPTS.find(candidate => candidate.path === LABELS_FILE)
  if (file === undefined) throw new Error(`${LABELS_FILE} is not among the scanned files`)
  return stateLabels(moduleOf(file))
}

const LABELS = kitLabels()

describe('state words gate', () => {
  it('reads the state word table from the shared kit', () => {
    expect(LABELS.size).toBeGreaterThan(30)
    expect([...LABELS].slice(0, 3)).toEqual(['思考中', '处理中', '排队中'])
  })

  it('adds no state word a module writes itself', () => {
    const found = SCRIPTS.filter(file => !isKit(file.path)).flatMap(file =>
      selfWrittenStates(moduleOf(file), LABELS).map(word => violation(file.path, word)),
    )
    const report = ratchet('state-words', tally(found))
    expect(report.missing, 'no baseline: write it once with DESIGN_GATES_SEED=1').toBe(false)
    expect(report.added, 'state words written by hand: render <StateWord state=…>').toEqual([])
    expect(
      report.stale,
      'moved onto StateWord; shrink state-words.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('counts a state word in a string, a template, JSX text and StateWord with its own words', () => {
    const labels = new Set(['已完成', '失败', '不可用', '已结束'])
    const source = `
      import { x } from '失败'
      const done = '已完成'; const why = \`来源 \${name} 失败：\${reason}\`; const late = '已结束，结局在路上'
      const view = <p>已完成 · 3<StateWord state="completed" /><StateWord fact="done">好了</StateWord></p>
      const custom = <StateWord state="failed" labels={mine} />
      const sentences = ['服务暂时不可用。', '供应失败', '这一轮已完成']`
    expect(selfWrittenStates(parseModule('sample.tsx', source), labels)).toEqual([
      '已完成',
      '失败',
      '已结束',
      '已完成',
      'StateWord fact',
      'StateWord labels',
    ])
  })
})
