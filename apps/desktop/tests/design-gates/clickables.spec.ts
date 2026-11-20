// @module-tag source-text
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ratchet, tally } from './ratchet.ts'
import { FILES, isKit, KIT } from './scope.ts'
import {
  attributes,
  attributeString,
  field,
  isIntrinsic,
  jsxName,
  moduleOf,
  nodes,
  parseModule,
  SCRIPTS,
  type SyntaxNode,
  violation,
  visit,
} from './source-text.ts'

/**
 * FE-I25: everything clickable answers hover and press with its family's feel, and the motion sheet finds a family
 * by its `data-control` mark. Two things are counted:
 *
 * - a native `button`, `input`, `select`, `textarea` or `details`: outside the shared kit always; inside it only
 *   when it carries no `data-control`, that is, when it is not the implementation of a control family;
 * - a clickable element without a family mark: a `button`, `a`, `summary`, or any DOM element with a click handler
 *   or `role="button"`. It is marked when it carries `data-control`, `data-glide-row` or `data-segment`, sits in a
 *   menu row (`data-glide-row`), passes a spread that can carry the mark, or is rendered through a kit family
 *   component with `asChild`, which puts the mark on it.
 *
 * What is counted today is the baseline; it only shrinks.
 */
const NATIVE = new Set(['button', 'input', 'select', 'textarea', 'details'])
const CLICKABLE_TAGS = new Set(['button', 'a', 'summary'])
const NOT_CLICKABLE = new Set(['input', 'textarea', 'select', 'form', 'label'])
const CLICK_HANDLERS = new Set([
  'onClick',
  'onPointerDown',
  'onMouseDown',
  'onPointerUp',
  'onDoubleClick',
])
const MARKS = new Set(['data-control', 'data-glide-row', 'data-segment'])
/** Kit components that spread their props onto a Radix part or `Slot` and set `data-control` after the spread. */
const FAMILY_WRAPPERS = new Set([
  'Button',
  'IconButton',
  'DropdownMenuItem',
  'DropdownMenuCheckboxItem',
  'DropdownMenuRadioItem',
  'DropdownMenuSubTrigger',
  'SelectTrigger',
  'SelectItem',
])
/** Expressions a JSX child can sit in between it and the element that holds it. */
const PASS_THROUGH = new Set([
  'JSXExpressionContainer',
  'ParenthesizedExpression',
  'ConditionalExpression',
  'LogicalExpression',
])

function attributeNames(opening: SyntaxNode): string[] {
  return attributes(opening).map(attribute => jsxName(field(attribute, 'name')))
}

/** The opening tag of the element whose children hold this one directly, if any. */
function holder(ancestors: readonly SyntaxNode[]): SyntaxNode | undefined {
  let index = ancestors.length - 1
  while (index >= 0 && PASS_THROUGH.has(ancestors[index]?.type ?? '')) index -= 1
  const node = ancestors[index]
  return node?.type === 'JSXElement' ? field(node, 'openingElement') : undefined
}

function isClickable(tag: string, opening: SyntaxNode): boolean {
  if (!isIntrinsic(tag)) return false
  if (CLICKABLE_TAGS.has(tag)) return true
  if (NOT_CLICKABLE.has(tag)) return false
  return (
    attributeNames(opening).some(name => CLICK_HANDLERS.has(name)) ||
    attributeString(opening, 'role') === 'button'
  )
}

function isMarked(opening: SyntaxNode, ancestors: readonly SyntaxNode[]): boolean {
  if (attributeNames(opening).some(name => MARKS.has(name))) return true
  if (nodes(opening, 'attributes').some(attribute => attribute.type === 'JSXSpreadAttribute'))
    return true
  const inRow = ancestors.some(
    node =>
      node.type === 'JSXElement' &&
      attributeNames(field(node, 'openingElement') ?? node).includes('data-glide-row'),
  )
  const wrapper = holder(ancestors)
  return (
    inRow ||
    (wrapper !== undefined &&
      FAMILY_WRAPPERS.has(jsxName(field(wrapper, 'name'))) &&
      attributeNames(wrapper).includes('asChild'))
  )
}

/** Each native control and each unmarked clickable element in a module, as `native <tag>` or `unmarked <tag>`. */
export function clickableViolations(tree: SyntaxNode, inKit: boolean): string[] {
  const found: string[] = []
  visit(tree, (node, ancestors) => {
    if (node.type !== 'JSXElement') return
    const opening = field(node, 'openingElement')
    if (opening === undefined) return
    const tag = jsxName(field(opening, 'name'))
    const marked = isMarked(opening, ancestors)
    if (
      isIntrinsic(tag) &&
      NATIVE.has(tag) &&
      (!inKit || !attributeNames(opening).includes('data-control'))
    )
      found.push(`native <${tag}>`)
    if (isClickable(tag, opening) && !marked) found.push(`unmarked <${tag}>`)
  })
  return found
}

describe('clickables gate', () => {
  it('names only family components the shared kit exports', () => {
    const entry = FILES.find(file => file.path === join(KIT, 'src/index.ts'))?.text ?? ''
    expect(
      [...FAMILY_WRAPPERS].filter(name => !new RegExp(`\\b${name}\\b`, 'u').test(entry)),
    ).toEqual([])
  })

  it('adds no native control and no clickable outside a control family', () => {
    const found = SCRIPTS.filter(file => file.kind === 'tsx').flatMap(file =>
      clickableViolations(moduleOf(file), isKit(file.path)).map(found =>
        violation(file.path, found),
      ),
    )
    const report = ratchet('clickables', tally(found))
    expect(report.missing, 'no baseline: write it once with DESIGN_GATES_SEED=1').toBe(false)
    expect(
      report.added,
      'native controls or unmarked clickables: render through a kit control',
    ).toEqual([])
    expect(
      report.stale,
      'moved onto a family; shrink clickables.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('sees native controls, and a mark given directly, through asChild, a menu row or a spread', () => {
    const source = `<>
      <button onClick={go} />
      <button data-control="row" onClick={go} />
      <Button asChild><a href="/a" /></Button>
      <DropdownMenuItem asChild>{open ? <a href="/b" /> : null}</DropdownMenuItem>
      <li data-glide-row=""><div><a href="#row" /></div></li>
      <Tooltip asChild><a href="#" /></Tooltip>
      <a {...props} />
      <div role="button" />
      <span onClick={go} />
      <input onClick={go} />
      <details data-control="disclosure"><summary>参数</summary></details>
      <Input onClick={go} />
    </>`
    const tree = parseModule('sample.tsx', source)
    expect(clickableViolations(tree, false)).toEqual([
      'native <button>',
      'unmarked <button>',
      'native <button>',
      'unmarked <a>',
      'unmarked <div>',
      'unmarked <span>',
      'native <input>',
      'native <details>',
      'unmarked <summary>',
    ])
    expect(clickableViolations(tree, true)).toEqual([
      'native <button>',
      'unmarked <button>',
      'unmarked <a>',
      'unmarked <div>',
      'unmarked <span>',
      'native <input>',
      'unmarked <summary>',
    ])
  })
})
