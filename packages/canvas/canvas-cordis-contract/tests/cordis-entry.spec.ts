import { Service } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import * as entry from '@omne-harness/canvas-cordis-contract/cordis'

it('gives the service of the canvas one identity, the point, and how a kind is put on it', () => {
  expect(entry.canvasKey).toBe('canvas')
  expect(entry.CanvasService.provide).toBe(entry.canvasKey)
  expect(entry.CanvasService.prototype).toBeInstanceOf(Service)
  expect(entry.CANVAS_KINDS_POINT).toBe('canvas.kinds')
  expect(Object.keys(entry).sort()).toEqual([
    'CANVAS_KINDS_POINT',
    'CanvasService',
    'canvasKey',
    'canvasKindsContract',
    'kindsOn',
    'putKind',
  ])
})
