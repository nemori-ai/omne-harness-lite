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
  PaperQuiet,
  PaperSurface,
} from '../src/index.ts'

const source = (...path: string[]): string =>
  readFileSync(join(import.meta.dirname, '..', 'src', ...path), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  )

type Rule = Readonly<{ selectors: readonly string[]; body: string }>

/** The innermost rules of a sheet, each selector list split at the commas outside parentheses. */
function rules(text: string): Rule[] {
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => {
    const selectors: string[] = []
    let depth = 0
    let start = 0
    const list = match[1]!.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
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

const PAPER = rules(source('paper', 'paper.css'))

const declares = (element: Element, sheet: readonly Rule[], declaration: RegExp): boolean =>
  sheet.some(
    rule =>
      declaration.test(rule.body) && rule.selectors.some(selector => element.matches(selector)),
  )

const keepsItsWidth = (element: Element): boolean =>
  declares(element, PAPER, /(?:^|;)\s*(?:flex\s*:\s*none|flex-shrink\s*:\s*0)\s*(?:;|$)/)
const givesWay = (element: Element): boolean =>
  !keepsItsWidth(element) && declares(element, PAPER, /(?:^|;)\s*min-width\s*:\s*0\s*(?:;|$)/)

afterEach(cleanup)

const BOX: PaperBox = { x: 96, y: 96, width: 320, height: 240 }

function Board({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <AppTooltipProvider>
      <PaperSurface
        label="画布"
        sheet={{ width: 2000, height: 1600, step: 16 }}
        view={{ x: 1000, y: 800, zoom: 1 }}
        onViewChange={() => undefined}
        zoomLimits={{ min: 0.5, max: 2 }}
        limits={{ minWidth: 64, minHeight: 64, maxWidth: 800, maxHeight: 800 }}
        magnet={false}
      >
        {children}
      </PaperSurface>
    </AppTooltipProvider>
  )
}

describe('who gives way in a name line: the content before the facts about it', () => {
  it('on a page the name gives way first, the quiet words next, and the marks and buttons keep their width', () => {
    render(
      <Board>
        <PaperPage
          box={BOX}
          name="报告"
          onPlace={() => undefined}
          aside={
            <>
              <span data-testid="by">
                <PaperQuiet>人 · 刚刚</PaperQuiet>
              </span>
              <span data-testid="mark">记号</span>
              <button type="button">⋯</button>
            </>
          }
        />
        <PaperPage box={{ ...BOX, x: 800 }} name="锁着" onPlace={() => undefined} locked />
      </Board>,
    )
    const page = within(screen.getByRole('group', { name: '报告' }))
    const handle = page.getByRole('button', { name: '挪动报告' })
    expect(givesWay(handle)).toBe(true)
    expect(givesWay(page.getByText('报告', { selector: '.omne-paper-name-text' }))).toBe(true)
    expect(givesWay(page.getByTestId('by'))).toBe(true)
    const words = page.getByText('人 · 刚刚')
    expect(givesWay(words)).toBe(true)
    expect(declares(words, PAPER, /text-overflow\s*:\s*ellipsis/)).toBe(true)
    expect(keepsItsWidth(page.getByTestId('mark'))).toBe(true)
    expect(keepsItsWidth(page.getByRole('button', { name: '⋯' }))).toBe(true)
    const locked = within(screen.getByRole('group', { name: '锁着' }))
    expect(givesWay(locked.getByText('锁着', { selector: '.omne-paper-name-text' }))).toBe(true)
  })

  it('on a pile only the name gives way; the count, the mark, the ⋯ and the toggle keep their width', () => {
    render(
      <Board>
        <PaperPile
          box={BOX}
          name="周报"
          leaves={[{ key: 'a', name: '甲', content: '甲的正文' }]}
          open={false}
          onOpenChange={() => undefined}
          onPlace={() => undefined}
          aside={
            <>
              <span data-testid="mark">记号</span>
              <button type="button">⋯</button>
            </>
          }
        />
      </Board>,
    )
    const pile = within(screen.getByRole('group', { name: '周报' }))
    expect(givesWay(pile.getByRole('button', { name: '挪动周报' }))).toBe(true)
    expect(givesWay(pile.getByText('周报', { selector: '.omne-paper-name-text' }))).toBe(true)
    expect(keepsItsWidth(pile.getByText('1', { selector: '.omne-paper-count' }))).toBe(true)
    expect(keepsItsWidth(pile.getByTestId('mark'))).toBe(true)
    expect(keepsItsWidth(pile.getByRole('button', { name: '⋯' }))).toBe(true)
    expect(keepsItsWidth(pile.getByRole('button', { name: '展开' }))).toBe(true)
  })
})

/** Every rule that lifts the faint ink, with the pointer, the press and the focus as probe attributes happy-dom can match. */
const LIFTS = [...rules(source('styles', 'motion.css')), ...PAPER]
  .filter(rule => /(?:^|;)\s*--omne-ink-faint\s*:/.test(rule.body))
  .flatMap(rule => rule.selectors)
  .map(selector =>
    selector
      .replaceAll(':hover', '[data-probe-hover]')
      .replaceAll(':focus-within', '[data-probe-focus]'),
  )
  .join(', ')

const lifted = (element: Element): boolean => element.closest(LIFTS) !== null

/** The pointer over an element is over every element it lies in. */
function pointAt(element: Element): void {
  for (let at: Element | null = element; at !== null; at = at.parentElement)
    at.setAttribute('data-probe-hover', '')
}

describe('the ink of a name line: faint until the page is looked at', () => {
  function drawn() {
    render(
      <Board>
        {['甲', '乙'].map((name, index) => (
          <PaperPage
            key={name}
            box={{ ...BOX, x: 96 + index * 400 }}
            name={name}
            onPlace={() => undefined}
            aside={<span data-testid={`mark-${name}`}>记号</span>}
          >
            <button type="button">{`${name}里的钮`}</button>
          </PaperPage>
        ))}
      </Board>,
    )
    return {
      surface: screen.getByRole('region', { name: '画布' }),
      page: (name: string) => screen.getByRole('group', { name }),
      mark: (name: string) => screen.getByTestId(`mark-${name}`),
    }
  }

  it('keeps every mark faint while the pointer is on bare paper', () => {
    const { surface, mark } = drawn()
    expect(LIFTS).not.toBe('')
    pointAt(surface)
    expect(lifted(mark('甲'))).toBe(false)
    expect(lifted(mark('乙'))).toBe(false)
  })

  it('deepens the marks of the page under the pointer only', () => {
    const { page, mark } = drawn()
    pointAt(page('甲'))
    expect(lifted(mark('甲'))).toBe(true)
    expect(lifted(mark('乙'))).toBe(false)
  })

  it('deepens them on a page that is selected or holds the focus, and on no other', () => {
    const { page, mark } = drawn()
    page('甲').setAttribute('data-selected', 'true')
    page('乙').setAttribute('data-probe-focus', '')
    expect(lifted(mark('甲'))).toBe(true)
    expect(lifted(mark('乙'))).toBe(true)
    cleanup()
    const again = drawn()
    again.page('甲').setAttribute('data-gesture', 'move')
    expect(lifted(again.mark('甲'))).toBe(true)
    expect(lifted(again.mark('乙'))).toBe(false)
  })

  it('still lifts the ink inside a control under the pointer, on the paper as anywhere', () => {
    const { surface } = drawn()
    const button = within(surface).getByRole('button', { name: '甲里的钮' })
    pointAt(button)
    expect(lifted(button)).toBe(true)
  })
})
