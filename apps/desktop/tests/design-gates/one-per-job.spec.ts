// @module-tag source-text
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ratchet, tally } from './ratchet.ts'
import { isKit, KIT } from './scope.ts'
import {
  attribute,
  attributeString,
  cssRules,
  field,
  isIntrinsic,
  isString,
  jsxName,
  moduleOf,
  nodes,
  parseModule,
  SCRIPTS,
  selectorClasses,
  STYLESHEETS,
  type SyntaxNode,
  templateParts,
  violation,
  visit,
} from './source-text.ts'

/**
 * FE-I28: errors, empty states and loading each have one shared component, `InlineNotice`, `EmptyState` and
 * `LoadingState`; folding has `Disclosure`; a pill or a number badge is the kit's. A second one is counted, once per
 * occurrence, and the count only shrinks:
 *
 * - an error said by a bare element with `role="alert"` instead of `InlineNotice`;
 * - a home-made empty state: an element with a `*-empty` class that does not hold `EmptyState`;
 * - a skeleton;
 * - bare loading text (`正在读…`, `读取中`, `加载中`) anywhere but the `label` of `LoadingState`;
 * - a native `details`, and a native `button` with `aria-expanded`, instead of `Disclosure`;
 * - a module's own pill or badge: a class whose name has the word `badge`, `pill` or `count`, styled in the module's
 *   own stylesheet with a radius or a background.
 *
 * The files that are the one implementation of a job match by design and are not read for that job.
 */
const OWNERS: Readonly<Record<string, string>> = {
  'error outside InlineNotice': join(KIT, 'src/patterns/inline-notice.tsx'),
  'home-made empty state': join(KIT, 'src/patterns/empty-state.tsx'),
  'bare loading text': join(KIT, 'src/patterns/loading-state.tsx'),
  'raw disclosure trigger': join(KIT, 'src/patterns/disclosure.tsx'),
}
/** The state word table names the loading state; it is the language, not a second loading component. */
const STATE_TABLE = join(KIT, 'src/patterns/ai/state-labels.ts')
const LOADING_TEXT = /^\s*(?:正在读|正在加载|读取中|加载中|载入中)/u
const LOADING_COMPONENTS = new Set(['LoadingState', 'LoadingIndicator'])
const BADGE_CLASS = /(?:^|[-_])(?:badge|pill|count)s?(?:$|[-_])/u
const BADGE_LOOK = /(?:^|;\s*)(?:border(?:-[a-z]+)*-radius|background(?:-color|-image)?)\s*:/u

function classTokens(opening: SyntaxNode): string[] {
  return (attributeString(opening, 'className') ?? '').split(/\s+/u).filter(token => token !== '')
}

/** Whether the first thing an element holds, blank text aside, is `EmptyState`. */
function holdsEmptyState(element: SyntaxNode): boolean {
  const child = nodes(element, 'children').find(
    node => !(node.type === 'JSXText' && String(node['value']).trim() === ''),
  )
  const opening = child?.type === 'JSXElement' ? field(child, 'openingElement') : undefined
  return opening !== undefined && jsxName(field(opening, 'name')) === 'EmptyState'
}

/** Whether a string sits in the `label` of `LoadingState`, where loading text belongs. */
function inLoadingLabel(ancestors: readonly SyntaxNode[]): boolean {
  for (let index = ancestors.length - 1; index > 0; index -= 1) {
    const node = ancestors[index]
    if (node?.type !== 'JSXAttribute') continue
    const opening = ancestors[index - 1]
    return (
      jsxName(field(node, 'name')) === 'label' &&
      opening !== undefined &&
      LOADING_COMPONENTS.has(jsxName(field(opening, 'name')))
    )
  }
  return false
}

function textsOf(node: SyntaxNode): string[] {
  if (isString(node)) return [String(node['value'])]
  if (node.type === 'JSXText') return [String(node['value'])]
  if (node.type === 'TemplateLiteral') return templateParts(node).slice(0, 1)
  return []
}

function elementJobs(element: SyntaxNode): string[] {
  const opening = field(element, 'openingElement')
  if (opening === undefined) return []
  const tag = jsxName(field(opening, 'name'))
  const jobs: string[] = []
  if (tag === 'Skeleton' || classTokens(opening).some(token => /skeleton/iu.test(token)))
    jobs.push('skeleton')
  if (!isIntrinsic(tag)) return jobs
  if (attributeString(opening, 'role') === 'alert') jobs.push('error outside InlineNotice')
  if (classTokens(opening).some(token => token.endsWith('-empty')) && !holdsEmptyState(element))
    jobs.push('home-made empty state')
  if (tag === 'details') jobs.push('native disclosure')
  if (tag === 'button' && attribute(opening, 'aria-expanded') !== undefined)
    jobs.push('raw disclosure trigger')
  return jobs
}

/** Each second component a module renders for a job, by the job's name. */
export function secondComponents(
  tree: SyntaxNode,
  owned: ReadonlySet<string> = new Set(),
): string[] {
  const found: string[] = []
  visit(tree, (node, ancestors) => {
    if (node.type === 'JSXElement') found.push(...elementJobs(node))
    if (ancestors.at(-1)?.type === 'ImportDeclaration') return
    if (textsOf(node).some(text => LOADING_TEXT.test(text)) && !inLoadingLabel(ancestors))
      found.push('bare loading text')
  })
  return found.filter(job => !owned.has(job))
}

/** Each class in a stylesheet that gives a pill or badge its look, as `own pill or badge .<class>`. */
export function ownBadges(stylesheet: string): string[] {
  const found = new Set<string>()
  for (const rule of cssRules(stylesheet))
    if (BADGE_LOOK.test(rule.declarations))
      for (const name of selectorClasses(rule.selector))
        if (BADGE_CLASS.test(name)) found.add(`own pill or badge .${name}`)
  return [...found]
}

function ownedJobs(path: string): Set<string> {
  const owned = new Set(
    Object.entries(OWNERS).flatMap(([job, owner]) => (owner === path ? [job] : [])),
  )
  if (path === STATE_TABLE) owned.add('bare loading text')
  return owned
}

describe('one component per job', () => {
  it('names owners the shared kit has', () => {
    const paths = new Set(SCRIPTS.map(file => file.path))
    expect([...Object.values(OWNERS), STATE_TABLE].filter(path => !paths.has(path))).toEqual([])
  })

  it('adds no second component for a job', () => {
    const scripts = SCRIPTS.filter(file => file.kind === 'tsx' || file.kind === 'ts').flatMap(
      file =>
        secondComponents(moduleOf(file), ownedJobs(file.path)).map(job =>
          violation(file.path, job),
        ),
    )
    const sheets = STYLESHEETS.filter(file => !isKit(file.path)).flatMap(file =>
      ownBadges(file.text).map(badge => violation(file.path, badge)),
    )
    const report = ratchet('one-per-job', tally([...scripts, ...sheets]))
    expect(report.missing, 'no baseline: write it once with DESIGN_GATES_SEED=1').toBe(false)
    expect(report.added, 'a second component for a job: use the kit component for it').toEqual([])
    expect(
      report.stale,
      'moved onto the kit; shrink one-per-job.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('recognises the shapes it guards against and leaves the kit components alone', () => {
    const source = `<>
      <p role="alert">{grant.error.message}</p>
      <InlineNotice tone="danger" role="alert">读不到</InlineNotice>
      <EmptyState role="alert" title="读不懂" />
      <p className="omne-background-empty">没有在后台的调用</p>
      <li className="conversation-empty"><EmptyState title="x" /></li>
      <Skeleton /><div className="row-skeleton" />
      <p className="note">正在读会话列表……</p>
      <LoadingState label="正在读取……" /><LoadingState label={busy ? '正在读取这一项……' : '读取中'} />
      <details><summary>参数</summary></details>
      <button aria-expanded={open} onClick={toggle} /><Button aria-expanded={open} />
    </>
    const READING = '正在读取当前租户……'; const tail = \`共 \${n} 条，正在读\``
    expect(secondComponents(parseModule('sample.tsx', source))).toEqual([
      'error outside InlineNotice',
      'home-made empty state',
      'skeleton',
      'skeleton',
      'bare loading text',
      'native disclosure',
      'raw disclosure trigger',
      'bare loading text',
    ])
    const sheet = `.hitl-badge { border-radius: var(--omne-radius-pill); }
      .notification-badge { font-size: var(--omne-text-meta); }
      .shell-nav-badge:empty { display: none } .shell-nav-badge { background: var(--omne-surface-hover) }
      .identity-account { border-radius: 4px } .row-counts > .x { background-color: red }`
    expect(ownBadges(sheet)).toEqual([
      'own pill or badge .hitl-badge',
      'own pill or badge .shell-nav-badge',
      'own pill or badge .row-counts',
    ])
  })
})
