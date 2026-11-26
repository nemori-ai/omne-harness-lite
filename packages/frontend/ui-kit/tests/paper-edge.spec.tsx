// @vitest-environment happy-dom
// @module-tag source-text
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  AppTooltipProvider,
  PAPER_NAME_LINE,
  type PaperBox,
  PaperPage,
  PaperSurface,
} from '../src/index.ts'
import { bubbleRests, edgeLines } from '../src/ink/note-ink.ts'
import { edgeShape } from '../src/paper/paper-edge.tsx'

const source = (...path: string[]): string =>
  readFileSync(join(import.meta.dirname, '..', 'src', ...path), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  )
const PAPER = source('paper', 'paper.css')
const INK = source('ink', 'ink.css')
const BOX: PaperBox = { x: 96, y: 96, width: 320, height: 240 }

afterEach(cleanup)

function Board({
  zoom = 1,
  children,
}: {
  readonly zoom?: number
  readonly children: React.ReactNode
}) {
  return (
    <AppTooltipProvider>
      <PaperSurface
        label="画布"
        sheet={{ width: 2000, height: 1600, step: 16 }}
        view={{ x: 1000, y: 800, zoom }}
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

const page = (name: string): HTMLElement => screen.getByRole('group', { name })
const edgeOf = (name: string): SVGSVGElement | null =>
  page(name).querySelector<SVGSVGElement>('svg[data-slot="paper-edge"]')
const paths = (edge: SVGSVGElement | null): string[] =>
  [...(edge?.querySelectorAll('path') ?? [])].map(path => path.getAttribute('d') ?? '')

describe('the ink edge of a selected page', () => {
  it('is drawn on a selected page and not on the others, and the solid accent line is gone', () => {
    render(
      <Board>
        <PaperPage box={BOX} name="甲" onPlace={() => undefined} />
        <PaperPage
          box={{ ...BOX, x: 800 }}
          name="乙"
          edgeKey="b"
          onPlace={() => undefined}
          selected
        />
      </Board>,
    )
    expect(edgeOf('甲')).toBeNull()
    const edge = edgeOf('乙')
    expect(edge).not.toBeNull()
    expect(edge!.getAttribute('aria-hidden')).toBe('true')
    expect(paths(edge)).toHaveLength(2)
    expect(PAPER).not.toMatch(/accent/u)
  })

  it('is the two strokes of the ink frame’s edge, without a lead, laid round the leaf at its size', () => {
    render(
      <Board>
        <PaperPage box={BOX} name="乙" edgeKey="b" onPlace={() => undefined} selected />
      </Board>,
    )
    const shape = edgeShape({ width: BOX.width, height: BOX.height - PAPER_NAME_LINE }, 'b', 1)
    expect(shape).toMatchObject({ width: BOX.width, height: BOX.height - PAPER_NAME_LINE })
    expect(paths(edgeOf('乙'))).toEqual([
      ...bubbleRests(edgeLines(shape), shape.unit, 'full', shape.weight),
    ])
    expect(edgeLines(shape).tail).toEqual([])
  })

  it('is the same ring each time one page is selected, and another ring on another page', () => {
    const { rerender } = render(
      <Board>
        <PaperPage box={BOX} name="乙" edgeKey="b" onPlace={() => undefined} selected />
        <PaperPage
          box={{ ...BOX, x: 800 }}
          name="丙"
          edgeKey="c"
          onPlace={() => undefined}
          selected
        />
      </Board>,
    )
    const once = paths(edgeOf('乙'))
    expect(paths(edgeOf('丙'))).not.toEqual(once)
    rerender(
      <Board>
        <PaperPage box={BOX} name="乙" edgeKey="b" onPlace={() => undefined} />
      </Board>,
    )
    expect(edgeOf('乙')).toBeNull()
    rerender(
      <Board>
        <PaperPage box={BOX} name="乙" edgeKey="b" onPlace={() => undefined} selected />
      </Board>,
    )
    expect(paths(edgeOf('乙'))).toEqual(once)
  })

  it('keeps at least the screen width it is given when the paper is far, and grows with it near', () => {
    const near = edgeShape({ width: 320, height: 218 }, 'b', 2)
    const standard = edgeShape({ width: 320, height: 218 }, 'b', 1)
    const far = edgeShape({ width: 320, height: 218 }, 'b', 0.25)
    expect(near.weight).toBe(standard.weight)
    expect(far.weight).toBeGreaterThan(standard.weight)
    expect(far.screen).toBeGreaterThanOrEqual(1)
  })

  it('takes its ink from the ink frame’s edge, has no transition and no filter', () => {
    expect(INK).toMatch(/\.omne-ink-bubble,\s*\.omne-paper-edge\s*\{[^}]*--omne-ink-bubble-edge:/u)
    expect(INK).toMatch(
      /\.omne-ink-bubble-edge path,\s*\.omne-paper-edge path\s*\{\s*fill: var\(--omne-ink-bubble-edge\)/u,
    )
    const own = [...PAPER.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match =>
      match[1]!.includes('.omne-paper-edge'),
    )
    expect(own.length).toBeGreaterThan(0)
    for (const [, , body] of own) expect(body).not.toMatch(/transition|animation|filter/u)
  })
})
