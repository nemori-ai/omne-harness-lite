// @vitest-environment happy-dom
// @module-tag source-text
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PaperStatus } from '../src/index.ts'

const SHEET = readFileSync(join(import.meta.dirname, '..', 'src', 'paper', 'paper.css'), 'utf8')
const REDUCED = '@media (prefers-reduced-motion: reduce)'
const OWN = SHEET.slice(0, SHEET.indexOf(REDUCED))
const STILL = SHEET.slice(SHEET.indexOf(REDUCED))

type Rule = Readonly<{ selectors: readonly string[]; body: string }>

/** The rules that name a part of the bar; the sheet's other selectors are left to their own cases. */
function rules(text: string): Rule[] {
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(match => ({
      selectors: match[1]!
        .split(',')
        .map(selector => selector.trim())
        .filter(selector => selector.startsWith('.omne-paper-status')),
      body: match[2]!.trim(),
    }))
    .filter(rule => rule.selectors.length > 0)
}

const declared = (sheet: string, element: Element, property: string): string[] =>
  rules(sheet)
    .filter(rule => rule.selectors.some(selector => element.matches(selector)))
    .flatMap(rule =>
      [...rule.body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]*)`, 'g'))].map(match =>
        match[1]!.trim(),
      ),
    )

afterEach(cleanup)

const info = (root: HTMLElement): HTMLElement => {
  const found = root.querySelector<HTMLElement>('[data-slot="paper-status-info"]')
  if (found === null) throw new Error('no info segment')
  return found
}

describe('the status bar under the paper', () => {
  it('draws what the caller gives into its two segments: the tools at the start, the info after them', () => {
    const { container } = render(
      <PaperStatus tools={<button type="button">查找</button>} info={<span>便签</span>} />,
    )
    const bar = container.querySelector<HTMLElement>('[data-slot="paper-status"]')!
    const tools = bar.querySelector('[data-slot="paper-status-tools"]')!
    expect(tools.contains(screen.getByRole('button', { name: '查找' }))).toBe(true)
    expect(info(bar).textContent).toBe('便签')
    expect(tools.compareDocumentPosition(info(bar)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(info(bar).getAttribute('aria-live')).toBeNull()
  })

  it('swaps one info for another at once, without hiding it in between', () => {
    const { container, rerender } = render(<PaperStatus info={<span>甲</span>} />)
    const segment = info(container)
    expect(segment.hasAttribute('data-empty')).toBe(false)
    rerender(<PaperStatus info={<span>乙</span>} />)
    expect(segment.textContent).toBe('乙')
    expect(segment.hasAttribute('data-empty')).toBe(false)
  })

  it('when nothing is given any more keeps the last info while it fades, hidden from a screen reader', () => {
    const { container, rerender } = render(<PaperStatus info={<span>甲</span>} />)
    rerender(<PaperStatus />)
    const segment = info(container)
    expect(segment.hasAttribute('data-empty')).toBe(true)
    expect(segment.getAttribute('aria-hidden')).toBe('true')
    expect(segment.textContent).toBe('甲')
    expect(declared(OWN, segment, 'opacity')).toEqual(['0'])
    rerender(<PaperStatus info={<span>乙</span>} />)
    expect(segment.hasAttribute('data-empty')).toBe(false)
    expect(segment.getAttribute('aria-hidden')).toBeNull()
    expect(segment.textContent).toBe('乙')
  })

  it('is empty, not a hint, when it has never been given anything', () => {
    const { container } = render(<PaperStatus />)
    expect(info(container).textContent).toBe('')
    expect(info(container).hasAttribute('data-empty')).toBe(true)
  })

  it('changes its info only by opacity: in at the feedback time, out a moment later, so a passing pointer does not flash it', () => {
    const { container, rerender } = render(<PaperStatus info="甲" />)
    const segment = info(container)
    const shown = declared(OWN, segment, 'transition')
    expect(shown).toEqual([
      expect.stringMatching(/^opacity var\(--omne-motion-feedback\) var\(--omne-motion-ease\)$/),
    ])
    rerender(<PaperStatus />)
    expect(declared(OWN, segment, 'transition').at(-1)).toMatch(
      /^opacity var\(--omne-motion-state\) var\(--omne-motion-ease\) var\(--omne-motion-layout\)$/,
    )
  })

  it('keeps one height whatever the info holds', () => {
    const { container } = render(<PaperStatus info="甲" />)
    const bar = container.querySelector<HTMLElement>('[data-slot="paper-status"]')!
    expect(declared(OWN, bar, 'height')).toEqual(['var(--omne-control-height)'])
    expect(declared(OWN, info(bar), 'height')).toEqual([])
  })

  it('has no transition at all when motion is reduced: the info is swapped at once', () => {
    const { container } = render(<PaperStatus info="甲" />)
    expect(declared(STILL, info(container), 'transition')).toEqual(['none !important'])
  })
})
