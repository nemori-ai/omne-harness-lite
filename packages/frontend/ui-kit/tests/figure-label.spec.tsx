// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FigureLabel } from '../src/index.ts'
import { NOTE_GAP } from '../src/ink/say.ts'
import { type Box } from '../src/ink/travel.ts'

const STYLES = readFileSync(join(import.meta.dirname, '../src/ink/ink.css'), 'utf8')
const FIGURE: Box = { x: 272, y: 172, width: 56, height: 56 }
const BOUNDS: Box = { x: 0, y: 0, width: 1200, height: 800 }
const WIDE = 180
const TALL = 40

const label = (): HTMLElement | null => document.querySelector('.omne-figure-label')
const lines = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('.omne-figure-label-line'),
]

beforeEach(() => {
  for (const [key, value] of [
    ['offsetWidth', WIDE],
    ['offsetHeight', TALL],
  ] as const)
    vi.spyOn(HTMLElement.prototype, key, 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('omne-figure-label') ? value : 0
    })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the label beside the figure', () => {
  it('writes the lines it is given, in order, and nothing of its own', () => {
    render(
      <FigureLabel
        figure={FIGURE}
        bounds={BOUNDS}
        lines={[{ text: '应用外面' }, { text: '松手就停在这里，双击回到应用' }]}
      />,
    )
    expect(lines().map(line => line.textContent)).toEqual([
      '应用外面',
      '松手就停在这里，双击回到应用',
    ])
    expect(label()?.textContent).toBe('应用外面松手就停在这里，双击回到应用')
  })

  it('a hint line is marked for the hint colour, the others are plain', () => {
    render(
      <FigureLabel
        figure={FIGURE}
        bounds={BOUNDS}
        lines={[{ text: '名字' }, { text: '松手直接发送', tone: 'hint' }, { text: '第三行' }]}
      />,
    )
    expect(lines().map(line => line.dataset['tone'])).toEqual(['plain', 'hint', 'plain'])
    const rule = STYLES.split('}').find(text =>
      text.includes(".omne-figure-label-line[data-tone='hint']"),
    )
    expect(rule).toMatch(/color:\s*var\(--omne-info-ink\)/)
  })

  it('sits beside the figure, and moves to the other side near the edge of its bounds', () => {
    const centre = { x: FIGURE.x + FIGURE.width / 2, y: FIGURE.y + FIGURE.height / 2 }
    const view = render(<FigureLabel figure={FIGURE} bounds={BOUNDS} lines={[{ text: '名字' }]} />)
    expect(label()?.style.left).toBe(`${centre.x + NOTE_GAP.x}px`)
    expect(label()?.style.top).toBe(`${centre.y + NOTE_GAP.y}px`)
    const narrow: Box = { x: 0, y: 0, width: centre.x + 100, height: 800 }
    view.rerender(<FigureLabel figure={FIGURE} bounds={narrow} lines={[{ text: '名字' }]} />)
    expect(label()?.style.left).toBe(`${centre.x - NOTE_GAP.x - WIDE}px`)
  })

  it('takes no pointer', () => {
    const rule = STYLES.split('}').find(text => /\.omne-figure-label\s*\{/.test(text))
    expect(rule).toMatch(/pointer-events:\s*none/)
  })
})
