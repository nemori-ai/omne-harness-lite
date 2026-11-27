import { SIZE_TIERS } from '@omne-harness/ui-kit'
import { describe, expect, it } from 'vitest'
import {
  VIEW_SIZES,
  viewAskedOf,
  viewOfQuery,
  viewQuery,
  type ViewAsked,
} from '../src/shared/view.ts'

const ASKED: ViewAsked = {
  page: 'notes',
  subject: 'note 7',
  theme: 'dark',
  size: 'reading',
  look: { kind: 'skin', name: 'paper' },
  width: 320,
  height: 2560,
}

describe('the request of the drawing window', () => {
  it('goes through the query of the window and back unchanged', () => {
    expect(viewOfQuery(viewQuery(ASKED))).toEqual(ASKED)
    expect(viewOfQuery(viewQuery({ ...ASKED, look: { kind: 'built-in' } }))).toEqual({
      ...ASKED,
      look: { kind: 'built-in' },
    })
  })

  it('is no request for a page a person opens', () => {
    expect(viewOfQuery('')).toBeUndefined()
    expect(viewOfQuery('?other=1')).toBeUndefined()
  })

  it('is a bad mode for any value it cannot draw, and for a query that does not read', () => {
    for (const bad of [
      { ...ASKED, width: 319 },
      { ...ASKED, height: 2561 },
      { ...ASKED, width: 400.5 },
      { ...ASKED, theme: 'sepia' },
      { ...ASKED, size: 'huge' },
      { ...ASKED, page: '' },
      { ...ASKED, subject: 7 },
      { ...ASKED, look: { kind: 'skin', name: '' } },
      { ...ASKED, look: { kind: 'own' } },
    ])
      expect(viewAskedOf(bad), JSON.stringify(bad)).toBeUndefined()
    expect(viewOfQuery('?view=not-json')).toBe('bad-mode')
    expect(viewOfQuery(`?view=${encodeURIComponent(JSON.stringify({ page: 'x' }))}`)).toBe(
      'bad-mode',
    )
  })

  it('knows the size tiers the shared interface parts know', () => {
    expect(VIEW_SIZES).toEqual(SIZE_TIERS)
  })
})
