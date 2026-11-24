// @vitest-environment happy-dom
// @module-tag source-text
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  AppTooltipProvider,
  type PaperBox,
  PaperPage,
  PaperPile,
  PaperQuiet,
  PaperSurface,
} from '../src/index.ts'

const SHEET = readFileSync(join(import.meta.dirname, '..', 'src', 'paper', 'paper.css'), 'utf8')
const OWN = SHEET.slice(0, SHEET.indexOf('@media (prefers-reduced-motion: reduce)'))
const BOX: PaperBox = { x: 96, y: 96, width: 320, height: 240 }

function rules(text: string): { selectors: string[]; body: string }[] {
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({
    selectors: match[1]!.split(',').map(selector => selector.trim()),
    body: match[2]!.trim(),
  }))
}

const hiding = rules(OWN).filter(
  rule =>
    /(?:^|;)\s*opacity\s*:/.test(rule.body) &&
    rule.selectors.some(selector => /\.omne-paper-(?:quiet|name-text)\b/.test(selector)),
)

/** The pointer and the focus are states happy-dom does not track; the probe stands in for them on the element. */
const PROBES = { hover: 'data-probe-hover', focus: 'data-probe-focus' } as const
const probed = hiding
  .flatMap(rule => rule.selectors)
  .map(selector =>
    selector
      .replaceAll(':hover', `[${PROBES.hover}]`)
      .replaceAll(':focus-within', `[${PROBES.focus}]`),
  )
  .join(', ')

const hidden = (element: Element): boolean => element.matches(probed)

afterEach(cleanup)

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

const aside = (
  <>
    <PaperQuiet>人 · 刚刚</PaperQuiet>
    <span data-testid="mark">记号</span>
  </>
)

function quietWords(group: HTMLElement): HTMLElement[] {
  const page = within(group)
  return [
    page.getByText('报告', { selector: '.omne-paper-name-text' }),
    page.getByText('人 · 刚刚'),
  ]
}

describe('the name line of a page', () => {
  it('hides its words only by opacity, so the line keeps its place and a screen reader still reads them', () => {
    expect(hiding.length).toBeGreaterThan(0)
    for (const rule of hiding) expect(rule.body.replace(/;$/, '')).toMatch(/^opacity:\s*0$/)
    render(
      <Board>
        <PaperPage box={BOX} name="报告" aside={aside} onPlace={() => undefined} />
      </Board>,
    )
    const group = screen.getByRole('group', { name: '报告' })
    for (const words of quietWords(group)) {
      expect(hidden(words)).toBe(true)
      expect(words.closest('[aria-hidden="true"]')).toBeNull()
    }
    expect(within(group).getByRole('button', { name: '挪动报告' })).toBeTruthy()
    expect(hidden(within(group).getByTestId('mark'))).toBe(false)
  })

  it.each([
    ['the pointer is over it', (group: HTMLElement) => group.setAttribute(PROBES.hover, '')],
    ['the focus is inside it', (group: HTMLElement) => group.setAttribute(PROBES.focus, '')],
    [
      'it is being carried',
      (group: HTMLElement) => {
        const handle = within(group).getByRole('button', { name: '挪动报告' })
        fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: 40, clientY: 40 })
        expect(group.dataset['gesture']).toBeDefined()
      },
    ],
  ])('writes the name and the quiet words out while %s', (_, look) => {
    render(
      <Board>
        <PaperPage box={BOX} name="报告" aside={aside} onPlace={() => undefined} />
        <PaperPage box={{ ...BOX, x: 800 }} name="别的" aside="旁" onPlace={() => undefined} />
      </Board>,
    )
    const group = screen.getByRole('group', { name: '报告' })
    look(group)
    for (const words of quietWords(group)) expect(hidden(words)).toBe(false)
    const other = screen.getByRole('group', { name: '别的' })
    expect(hidden(within(other).getByText('别的', { selector: '.omne-paper-name-text' }))).toBe(
      true,
    )
  })

  it('writes them out while it is selected, and on a locked page as well as a free one', () => {
    render(
      <Board>
        <PaperPage box={BOX} name="报告" aside={aside} onPlace={() => undefined} selected />
        <PaperPage box={{ ...BOX, x: 800 }} name="锁着" onPlace={() => undefined} locked />
      </Board>,
    )
    for (const words of quietWords(screen.getByRole('group', { name: '报告' })))
      expect(hidden(words)).toBe(false)
    const locked = screen.getByRole('group', { name: '锁着' })
    const name = within(locked).getByText('锁着', { selector: '.omne-paper-name-text' })
    expect(hidden(name)).toBe(true)
    locked.setAttribute(PROBES.hover, '')
    expect(hidden(name)).toBe(false)
  })

  it('fades its words in and out in the feedback time', () => {
    const fades = rules(OWN).filter(
      rule => rule.selectors.includes('.omne-paper-quiet') && /transition\s*:/.test(rule.body),
    )
    expect(fades.map(rule => rule.body)).toEqual([
      expect.stringMatching(/^transition:\s*opacity var\(--omne-motion-feedback\)/),
    ])
  })
})

describe('the name line of a pile', () => {
  const LEAVES = ['甲', '乙'].map(name => ({ key: name, name, content: `${name}的正文` }))

  it('keeps the name and the count always, and quiets only the words the caller marks', () => {
    render(
      <Board>
        <PaperPile
          box={BOX}
          name="资料"
          leaves={LEAVES}
          open={false}
          onOpenChange={() => undefined}
          onPlace={() => undefined}
          aside={aside}
        />
      </Board>,
    )
    const group = screen.getByRole('group', { name: '资料' })
    expect(hidden(within(group).getByText('资料'))).toBe(false)
    expect(hidden(within(group).getByText('2'))).toBe(false)
    const words = within(group).getByText('人 · 刚刚')
    expect(hidden(words)).toBe(true)
    group.setAttribute(PROBES.hover, '')
    expect(hidden(words)).toBe(false)
  })

  it('quiets the name over each page of an open pile until that page is looked at', () => {
    render(
      <Board>
        <PaperPile
          box={BOX}
          name="资料"
          leaves={LEAVES}
          open
          onOpenChange={() => undefined}
          onPlace={() => undefined}
        />
      </Board>,
    )
    const [first, second] = ['甲', '乙'].map(name => screen.getByRole('group', { name }))
    const nameOf = (leaf: HTMLElement) =>
      within(leaf).getByText(leaf.getAttribute('aria-label')!, {
        selector: '.omne-paper-name-text',
      })
    expect(hidden(nameOf(first!))).toBe(true)
    first!.setAttribute(PROBES.hover, '')
    expect(hidden(nameOf(first!))).toBe(false)
    expect(hidden(nameOf(second!))).toBe(true)
    second!.setAttribute(PROBES.focus, '')
    expect(hidden(nameOf(second!))).toBe(false)
  })
})
