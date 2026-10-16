import { runInNewContext } from 'node:vm'
import ts from '@typescript/typescript6'
import { expect, it } from 'vitest'
import { architectureScript } from '../src/report/architecture-render.ts'

it('initializes the emitted conformance browser without module imports and shows retired roles separately', () => {
  const script = architectureScript()
  const syntax = ts.createSourceFile('report.js', script, ts.ScriptTarget.Latest, true)
  let initializer: string | undefined
  function find(node: ts.Node): void {
    if (ts.isFunctionExpression(node) && node.name?.text === 'conformanceBrowser')
      initializer = node.getText(syntax)
    ts.forEachChild(node, find)
  }
  find(syntax)
  expect(initializer).toBeDefined()

  class Element {
    textContent = ''
    readonly children: Element[] = []
    append(...children: Element[]): void {
      this.children.push(...children)
    }
    replaceChildren(): void {
      this.children.length = 0
    }
    setAttribute(): void {}
  }
  const elements = new Map<string, Element>()
  const document = {
    createElement: () => new Element(),
    getElementById(id: string) {
      if (!elements.has(id)) elements.set(id, new Element())
      return elements.get(id)
    },
  }
  const role = (id: string) => ({
    id,
    domains: ['business'],
    paths: ['apps/ui/src/**'],
    status: 'adopted',
    layer: 'interaction',
    source: 'accepted.md',
  })
  const input = {
    source: { commit: 'base', dirty: false },
    path: 'constraints.json',
    retiredRoleIds: ['retired'],
    value: {
      domains: [{ id: 'business', label: 'Business', source: 'accepted.md' }],
      roles: [role('retired'), role('current')],
    },
  }
  const graph = {
    nodes: [],
    document: { current: { members: [] } },
    conformance: {
      current: input,
      baseline: input,
      comparedWith: 'baseline',
      rows: [],
      changes: [],
      sourceChanges: [],
      coverage: [],
    },
  }
  const ui = {
    select: () => ({ value: '', setOptions() {}, onChange() {} }),
    onView() {},
    action: () => new Element(),
  }
  runInNewContext(`(${initializer})(graph, () => {}, () => ({}), ui).refresh()`, {
    document,
    graph,
    ui,
  })
  const responsibility = elements.get('conformance-responsibility')
  expect(responsibility?.children[0]?.textContent).toContain('历史版本 base 已退役 1')
  const mappings = responsibility?.children.flatMap(box => box.children.map(row => row.textContent))
  expect(mappings).toContain('adopted · interaction · current · apps/ui/src/** · accepted.md')
  expect(mappings?.some(text => text.includes('· retired ·'))).toBe(false)
  expect(elements.get('conformance-counts')?.textContent).toContain('共 0 条')
})
