// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DoneIcon, ICONS, RedrawProvider, SendIcon, iconNames, type Redraw } from '../src/index.ts'

afterEach(cleanup)

const html = (node: React.ReactNode, redraw?: Redraw): string => {
  const { container } = render(
    redraw === undefined ? node : <RedrawProvider value={redraw}>{node}</RedrawProvider>,
  )
  const drawn = container.innerHTML
  cleanup()
  return drawn.replace(/omne-icon-[^"\s)]+/g, 'omne-icon-id')
}

describe('an icon of the set, drawn where a redraw may stand', () => {
  it('draws its own glyph with no element around it when nothing redraws', () => {
    const { container } = render(<DoneIcon size={16} className="mark" />)
    const root = container.firstElementChild
    expect(container.childElementCount).toBe(1)
    expect(root?.tagName.toLowerCase()).toBe('svg')
    expect(root?.getAttribute('data-icon')).toBe('done')
    expect(root?.getAttribute('width')).toBe('16')
    expect(root?.getAttribute('class')).toBe('omne-icon mark')
  })

  it('is the same markup when the redraw gives back its own drawing', () => {
    const own: Redraw = (_kind, _key, _subject, builtIn) => builtIn()
    expect(html(<DoneIcon size={16} className="mark" />, own)).toBe(
      html(<DoneIcon size={16} className="mark" />),
    )
  })

  it('is drawn by the redraw, which is told the kind, the name and how it was asked for', () => {
    const asked: unknown[] = []
    const redraw: Redraw = (kind, key, subject, builtIn) => {
      asked.push({ kind, key, subject })
      return <span data-redrawn={key}>{key === 'send' ? null : builtIn()}</span>
    }
    const { container } = render(
      <RedrawProvider value={redraw}>
        <SendIcon size={20} className="go" aria-label="send it" />
        <DoneIcon />
      </RedrawProvider>,
    )
    expect(asked).toEqual([
      { kind: 'icon', key: 'send', subject: { name: 'send', size: 20, className: 'go' } },
      { kind: 'icon', key: 'done', subject: { name: 'done', size: 24, className: undefined } },
    ])
    const [send, done] = Array.from(container.children)
    expect(send?.getAttribute('data-redrawn')).toBe('send')
    expect(send?.childElementCount).toBe(0)
    expect(done?.querySelector('svg')?.getAttribute('data-icon')).toBe('done')
  })
})

describe('the names of the icons', () => {
  it('are every name an icon of the set is drawn by, once each, in order', () => {
    const names = iconNames()
    expect(names).toEqual([...new Set(names)].sort())
    for (const Icon of Object.values(ICONS)) {
      const { container } = render(<Icon />)
      expect(names).toContain(container.firstElementChild?.getAttribute('data-icon'))
      cleanup()
    }
    expect(names).toContain('disclosure')
  })
})
