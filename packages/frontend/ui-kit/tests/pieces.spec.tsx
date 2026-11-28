// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  EmptyState,
  InlineNotice,
  LoadingIndicator,
  PIECES,
  RedrawProvider,
  type Redraw,
} from '../src/index.ts'

afterEach(cleanup)

const own: Redraw = (_kind, _key, _subject, builtIn) => builtIn()

function html(node: React.ReactNode, redraw?: Redraw): string {
  const { container } = render(
    redraw === undefined ? node : <RedrawProvider value={redraw}>{node}</RedrawProvider>,
  )
  const drawn = container.innerHTML
  cleanup()
  return drawn.replace(/omne-loading-[^"\s)]+-(\d+)/g, 'omne-loading-id-$1')
}

function asked(node: React.ReactNode): readonly unknown[] {
  const seen: unknown[] = []
  const redraw: Redraw = (kind, key, subject) => {
    seen.push({ kind, key, subject })
    return <i data-redrawn={key} />
  }
  render(<RedrawProvider value={redraw}>{node}</RedrawProvider>)
  return seen
}

const PIECE: Readonly<Record<string, () => React.ReactNode>> = {
  loading: () => <LoadingIndicator size="sm" className="mine" />,
  'empty-state': () => <EmptyState title="还没有" hint="写一条试试" />,
  'inline-notice': () => (
    <InlineNotice tone="caution" title="注意" still>
      正文
    </InlineNotice>
  ),
}

describe('the pieces of the kit that a redraw may stand in for', () => {
  it('are these five, by name', () => {
    expect(PIECES).toEqual(['empty-state', 'figure', 'inline-notice', 'loading', 'note'])
  })

  it.each(Object.keys(PIECE))(
    '%s is the same markup with no redraw and with one that gives back its own drawing',
    key => {
      const draw = PIECE[key]
      if (draw === undefined) throw new Error('no such piece')
      expect(html(draw(), own)).toBe(html(draw()))
      expect(html(draw())).not.toBe('')
    },
  )

  it('the loading mark is drawn by the redraw, told its size, whether it runs and whether it counts', () => {
    expect(asked(<LoadingIndicator size="sm" active={false} className="mine" />)).toEqual([
      {
        kind: 'piece',
        key: 'loading',
        subject: { size: 'sm', active: false, counted: false, className: 'mine' },
      },
    ])
    expect(document.querySelector('[data-redrawn="loading"]')).not.toBeNull()
    expect(document.querySelector('[data-loading-indicator]')).toBeNull()
  })

  it('the empty state is drawn by the redraw, told its words and its action', () => {
    const action = <button type="button">新建</button>
    expect(
      asked(<EmptyState title="还没有" hint="写一条试试" action={action} role="status" />),
    ).toEqual([
      {
        kind: 'piece',
        key: 'empty-state',
        subject: {
          title: '还没有',
          hint: '写一条试试',
          action,
          role: 'status',
          className: undefined,
        },
      },
    ])
    expect(document.querySelector('.empty-state')).toBeNull()
  })

  it('the notice is drawn by the redraw, told its tone, its words and what it offers', () => {
    const act = { label: '重试', onClick: () => undefined }
    expect(
      asked(
        <InlineNotice tone="danger" title="没发出" detail="E1" action={act} still>
          正文
        </InlineNotice>,
      ),
    ).toEqual([
      {
        kind: 'piece',
        key: 'inline-notice',
        subject: { tone: 'danger', title: '没发出', body: '正文', detail: 'E1', action: act },
      },
    ])
    expect(document.querySelector('[data-inline-notice]')).toBeNull()
  })
})
