import { expect, it } from 'vitest'

it('the root entry exports the views and the models, and no Cordis binding', async () => {
  const root = (await import('@omne-harness/media-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'AttachmentTray',
    'AttachmentTrayView',
    'IMAGE_TYPES',
    'MediaBlock',
    'readWhole',
    'uploadMedium',
  ])
})

it('the ./cordis entry exports the module factory and its parts only', async () => {
  const cordis = (await import('@omne-harness/media-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual(['createMediaUiModule', 'mediaParts'])
  const made = (cordis['createMediaUiModule'] as () => unknown)()
  expect(made).toMatchObject({ name: 'media-ui' })
})
