import { Service } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import * as entry from '@omne-harness/canvas-cordis-contract/cordis'

it('gives the services of the canvas and of its changes one identity each, the point, and how a kind is put on it', () => {
  expect(entry.canvasKey).toBe('canvas')
  expect(entry.CanvasService.provide).toBe(entry.canvasKey)
  expect(entry.CanvasService.prototype).toBeInstanceOf(Service)
  expect(entry.canvasChangesKey).toBe('canvasChanges')
  expect(entry.CanvasChangesService.provide).toBe(entry.canvasChangesKey)
  expect(entry.CanvasChangesService.prototype).toBeInstanceOf(Service)
  expect(entry.CANVAS_KINDS_POINT).toBe('canvas.kinds')
  expect(Object.keys(entry).sort()).toEqual([
    'CANVAS_KINDS_POINT',
    'CanvasChangesService',
    'CanvasService',
    'canvasChangesKey',
    'canvasKey',
    'canvasKindsContract',
    'kindsOn',
    'putKind',
  ])
})
