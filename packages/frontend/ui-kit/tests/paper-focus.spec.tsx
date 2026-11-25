// @vitest-environment happy-dom
// @module-tag source-text
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  AppTooltipProvider,
  type PaperBox,
  PaperPage,
  PaperPile,
  PaperSurface,
} from '../src/index.ts'

const SHEET = readFileSync(join(import.meta.dirname, '..', 'src', 'paper', 'paper.css'), 'utf8')
const OWN = SHEET.slice(0, SHEET.indexOf('@media (prefers-reduced-motion: reduce)'))
const BOX: PaperBox = { x: 96, y: 96, width: 320, height: 240 }
const PROBE = '[data-probe-focus]'

type Rule = Readonly<{ selectors: readonly string[]; body: string }>

/** The innermost rules, each selector list split at the commas outside parentheses. */
function rules(text: string): Rule[] {
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => {
    const selectors: string[] = []
    let depth = 0
    let start = 0
    const list = match[1]!.replace(/\s+/g, ' ')
    for (let at = 0; at < list.length; at += 1) {
      if (list[at] === '(') depth += 1
      if (list[at] === ')') depth -= 1
      if (list[at] === ',' && depth === 0) {
        selectors.push(list.slice(start, at).trim())
        start = at + 1
      }
    }
    selectors.push(list.slice(start).trim())
    return { selectors, body: match[2]!.trim() }
  })
}

const outlined = rules(OWN).filter(rule => /(?:^|;)\s*outline\s*:/.test(rule.body))

/** happy-dom has no `:has()`, so `A:has(B) C` is read by hand: A is the thing, B is found inside it, C is what it draws. */
function drawnBy(selector: string, thing: Element): Element[] {
  const at = selector.indexOf(':has(')
  if (at < 0) return []
  let depth = 0
  let end = at + 5
  for (; end < selector.length; end += 1) {
    if (selector[end] === '(') depth += 1
    if (selector[end] === ')') {
      if (depth === 0) break
      depth -= 1
    }
  }
  const [own, inside, rest] = [
    selector.slice(0, at),
    selector.slice(at + 5, end),
    selector.slice(end + 1).trim(),
  ]
  const probed = (text: string): string => text.replaceAll(':focus-visible', PROBE)
  if (!thing.matches(own) || thing.querySelector(`:scope ${probed(inside)}`) === null) return []
  return [...thing.querySelectorAll(`:scope ${probed(rest)}`)]
}

const ringed = (thing: Element): Element[] =>
  outlined
    .filter(rule => !/outline\s*:\s*none/.test(rule.body))
    .flatMap(rule => rule.selectors.flatMap(selector => drawnBy(selector, thing)))

const unringed = (element: Element): boolean =>
  outlined
    .filter(rule => /outline\s*:\s*none/.test(rule.body))
    .some(rule =>
      rule.selectors.some(selector =>
        element.matches(selector.replaceAll(':focus-visible', PROBE)),
      ),
    )

afterEach(cleanup)

function Board({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <AppTooltipProvider>
      <PaperSurface
        label="画布"
        sheet={{ width: 2000, height: 1600, step: 16 }}
        view={{ x: 1000, y: 800, zoom: 1 }}
        onViewChange={() => undefined}
        zoomLimits={{ min: 0.25, max: 2 }}
        limits={{ minWidth: 64, minHeight: 64, maxWidth: 800, maxHeight: 800 }}
        magnet={false}
      >
        {children}
      </PaperSurface>
    </AppTooltipProvider>
  )
}

const LEAVES = ['甲', '乙', '丙'].map(name => ({ key: name, name, content: `${name}的正文` }))

describe('the keyboard ring of a page is drawn round its leaf, not round its name', () => {
  it('rings the leaf of the page whose handle has the keyboard focus, and not the handle itself', () => {
    render(
      <Board>
        <PaperPage box={BOX} name="报告" onPlace={() => undefined} />
        <PaperPage box={{ ...BOX, x: 800 }} name="别的" onPlace={() => undefined} />
      </Board>,
    )
    const page = screen.getByRole('group', { name: '报告' })
    const leaf = page.querySelector(':scope > .omne-paper-leaf')!
    const handle = within(page).getByRole('button', { name: '挪动报告' })
    expect(ringed(page)).toEqual([])
    handle.setAttribute('data-probe-focus', '')
    expect(ringed(page)).toEqual([leaf])
    expect(unringed(handle)).toBe(true)
    expect(ringed(screen.getByRole('group', { name: '别的' }))).toEqual([])
  })

  it('rings the top page of a pile whose name has the keyboard focus, closed or open', () => {
    for (const open of [false, true]) {
      const { unmount } = render(
        <Board>
          <PaperPile
            box={BOX}
            name="资料"
            leaves={LEAVES}
            open={open}
            onOpenChange={() => undefined}
            onPlace={() => undefined}
          />
        </Board>,
      )
      const pile = screen.getByRole('group', { name: '资料' })
      const top = pile.querySelector('[data-depth="0"] > .omne-paper-leaf')!
      const handle = within(pile).getByRole('button', { name: '挪动资料' })
      expect(ringed(pile)).toEqual([])
      handle.setAttribute('data-probe-focus', '')
      expect(ringed(pile)).toEqual([top])
      expect(unringed(handle)).toBe(true)
      unmount()
    }
  })

  it('is the K2 ring: the ring width in the focus line, the ring offset away, nothing else', () => {
    const ring = outlined.filter(rule =>
      rule.selectors.some(selector => selector.includes(':has(')),
    )
    expect(ring.map(rule => rule.body.replace(/\s+/g, ' '))).toEqual([
      'outline: var(--omne-ring-width) solid var(--omne-line-focus); outline-offset: var(--omne-ring-offset);',
    ])
  })
})
