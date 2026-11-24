import { expect, it } from 'vitest'
import { definitionNamesOf, isDefinitionName } from '@omne-harness/media-contract'

it.each([
  ['application/pdf', ['application-pdf', 'file']],
  ['audio/wav', ['audio-wav', 'voice']],
  ['image/svg+xml', ['image-svg-xml', 'image']],
  ['application/vnd.ms-excel', ['application-vnd-ms-excel', 'file']],
  ['Audio/X-WAV', ['audio-x-wav', 'voice']],
])('asks the name of the type before the name of its modality: %s', (mediaType, names) => {
  expect(definitionNamesOf(mediaType)).toEqual(names)
})

it.each(['audio/wav; codecs=1', 'image/', 'application/x_y', ''])(
  'asks only the modality when the type makes no name: %j',
  mediaType => {
    expect(definitionNamesOf(mediaType)).toHaveLength(1)
  },
)

it('names a kind of medium: a modality, or a media type written as a name', () => {
  expect(isDefinitionName(`a-${'b'.repeat(62)}`)).toBe(true)
  for (const name of ['image', 'voice', 'file', 'application-pdf', 'audio-x-wav'])
    expect(isDefinitionName(name), name).toBe(true)
  for (const name of [
    '',
    'pdf',
    'Voice',
    'audio/wav',
    'audio--wav',
    '-wav',
    'wav-',
    `a-${'b'.repeat(63)}`,
  ])
    expect(isDefinitionName(name), name).toBe(false)
})

it('names every type it gives by the same rule', () => {
  for (const mediaType of ['application/pdf', 'image/svg+xml', 'text/plain', 'video/mp4'])
    expect(definitionNamesOf(mediaType).every(isDefinitionName)).toBe(true)
})
