import { expect, it } from 'vitest'

it('the Cordis entry gives the module, its parts and the four client points with their names', async () => {
  const cordis = (await import('@omne-harness/canvas-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'CANVAS_APP_RENDER',
    'CANVAS_BACK_ID',
    'CANVAS_ELEMENT',
    'CANVAS_INTAKE',
    'CANVAS_KINDS',
    'CANVAS_PICKER',
    'canvasAppRender',
    'canvasElement',
    'canvasIntake',
    'canvasParts',
    'canvasPicker',
    'canvasUiModule',
  ])
  expect(cordis['canvasUiModule']).toMatchObject({ name: 'canvas-ui' })
})
