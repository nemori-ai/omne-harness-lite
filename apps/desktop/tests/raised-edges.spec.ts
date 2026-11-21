import { describe, expect, it } from 'vitest'

import { type Clipper, type Control, raisedEdges } from './support/raised-edges.ts'

/**
 * FE-I37: the judge the look walk runs on every shot. A raised control and its room (the farther of its shadow's
 * reach and the ring room) lie inside every ancestor that clips it; one scrolled out of view is not cut.
 */

const HAIRLINE = 'rgb(214, 210, 196) 0px 0px 0px 1px'
const NO_BORDER = ['0px none rgb(29, 28, 24)']

const control = (overrides: Partial<Control>): Control => ({
  control: 'button',
  label: '新建会话 .omne-session-new',
  box: { x: 20, y: 20, width: 100, height: 40 },
  borders: NO_BORDER,
  boxShadow: HAIRLINE,
  ringRoom: 4,
  clippers: [],
  ...overrides,
})

/** A container that does not scroll, clipping both axes. */
const still = (box: Clipper['box'], name = 'shell-sidebar'): Clipper => ({
  name,
  box,
  x: { overflow: 'hidden', position: 0, size: box.width, client: box.width },
  y: { overflow: 'hidden', position: 0, size: box.height, client: box.height },
})

/** A list that scrolls on y: 600 px of content in a 300 px window, scrolled to `position`. */
const list = (position: number): Clipper => ({
  name: 'omne-session-list',
  box: { x: 0, y: 100, width: 200, height: 300 },
  y: { overflow: 'auto', position, size: 600, client: 300 },
})

describe('raised edges', () => {
  it('cuts a control a still ancestor clips by 1 px on the left', () => {
    const found = raisedEdges([
      control({
        box: { x: 11, y: 20, width: 100, height: 40 },
        clippers: [still({ x: 8, y: 0, width: 300, height: 300 })],
      }),
    ])
    expect(found.violations).toEqual([
      {
        control: 'button',
        label: '新建会话 .omne-session-new',
        clipper: 'shell-sidebar',
        side: 'left',
        short: 1,
      },
    ])
  })

  it('reaches as far as the outer shadow does, with its offset, blur and spread', () => {
    const found = raisedEdges([
      control({
        box: { x: 40, y: 40, width: 100, height: 40 },
        boxShadow: `${HAIRLINE}, color(srgb 0.1 0.1 0.1 / 0.12) 0px 8px 24px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 60px, rgb(0, 0, 0) 0px 0px 0px 60px inset`,
        clippers: [still({ x: 0, y: 0, width: 180, height: 100 })],
      }),
    ])
    expect(found.violations.map(({ side, short }) => ({ side, short }))).toEqual([
      { side: 'bottom', short: 12 },
    ])
  })

  it('cuts a control whose ring room the ancestor does not leave', () => {
    const found = raisedEdges([
      control({
        box: { x: 20, y: 3, width: 100, height: 40 },
        borders: ['1px solid rgb(214, 210, 196)'],
        boxShadow: 'none',
        clippers: [still({ x: 0, y: 0, width: 300, height: 300 })],
      }),
    ])
    expect(found.violations.map(({ side, short }) => ({ side, short }))).toEqual([
      { side: 'top', short: 1 },
    ])
  })

  it('does not cut a control a scrolled list shows only in part', () => {
    const found = raisedEdges([
      control({ box: { x: 20, y: 90, width: 100, height: 40 }, clippers: [list(120)] }),
    ])
    expect(found.raised).toHaveLength(1)
    expect(found.violations).toEqual([])
  })

  it('cuts a control crossing the top edge of a list scrolled to its start', () => {
    const found = raisedEdges([
      control({ box: { x: 20, y: 102, width: 100, height: 40 }, clippers: [list(0)] }),
    ])
    expect(found.violations.map(({ clipper, side, short }) => ({ clipper, side, short }))).toEqual([
      { clipper: 'omne-session-list', side: 'top', short: 2 },
    ])
  })

  it('cuts a control crossing the bottom edge of a list scrolled to its end, not before', () => {
    const crossing = { x: 20, y: 380, width: 100, height: 40 }
    expect(raisedEdges([control({ box: crossing, clippers: [list(300)] })]).violations).toEqual([
      expect.objectContaining({ side: 'bottom', short: 24 }),
    ])
    expect(raisedEdges([control({ box: crossing, clippers: [list(200)] })]).violations).toEqual([])
  })

  it('does not cut a control wholly outside what the ancestor shows, there or farther out', () => {
    const found = raisedEdges([
      control({
        box: { x: 20, y: 500, width: 100, height: 40 },
        clippers: [
          still({ x: 0, y: 0, width: 300, height: 300 }, 'omne-fold'),
          still({ x: 0, y: 0, width: 300, height: 520 }),
        ],
      }),
    ])
    expect(found.violations).toEqual([])
  })

  it('does not cut on an axis whose overflow is visible', () => {
    const found = raisedEdges([
      control({
        box: { x: 0, y: 20, width: 100, height: 40 },
        clippers: [
          {
            name: 'omne-row',
            box: { x: 0, y: 0, width: 300, height: 300 },
            y: { overflow: 'clip', position: 0, size: 300, client: 300 },
          },
        ],
      }),
    ])
    expect(found.violations).toEqual([])
  })

  it('widens the clip of overflow: clip by its clip margin', () => {
    const fold = (clipMargin: number): Clipper => ({
      name: 'omne-fold',
      box: { x: 20, y: 0, width: 300, height: 300 },
      x: { overflow: 'clip', position: 0, size: 300, client: 300, clipMargin },
    })
    expect(raisedEdges([control({ clippers: [fold(4)] })]).violations).toEqual([])
    expect(raisedEdges([control({ clippers: [fold(0)] })]).violations).toEqual([
      expect.objectContaining({ clipper: 'omne-fold', side: 'left', short: 4 }),
    ])
  })

  it('tells a cut once, by the nearest ancestor that makes it', () => {
    const found = raisedEdges([
      control({
        box: { x: 12, y: 20, width: 100, height: 40 },
        clippers: [
          still({ x: 12, y: 0, width: 300, height: 300 }, 'shell-sidebar-primary'),
          still({ x: 12, y: 0, width: 400, height: 300 }),
        ],
      }),
    ])
    expect(found.violations.map(({ clipper, side }) => `${clipper} ${side}`)).toEqual([
      'shell-sidebar-primary left',
    ])
  })

  it('counts as raised only a control with a border or an outer shadow that draws', () => {
    const found = raisedEdges([
      control({
        label: 'ghost',
        boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 1px, rgb(0, 0, 0) 0px 0px 0px 1px inset',
      }),
      control({
        label: 'invisible border',
        boxShadow: 'none',
        borders: ['1px solid rgba(0, 0, 0, 0)', '1px none rgb(0, 0, 0)'],
      }),
      control({
        label: 'field',
        boxShadow: 'none',
        borders: ['1px solid color(srgb 0.8 0.8 0.8 / 0.5)'],
      }),
      control({ label: 'outline' }),
    ])
    expect(found.raised.map(({ label }) => label)).toEqual(['field', 'outline'])
  })
})
