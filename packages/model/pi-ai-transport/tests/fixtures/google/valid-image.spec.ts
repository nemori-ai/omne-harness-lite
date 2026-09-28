import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createGoogleInputMeter } from '../../../src/input-meters/google.ts'
import { googleDefinitions } from '../../../src/official-models/google.ts'
import { planRequest } from '../../../src/plan.ts'
import { googleCertificationRequest } from './cases.ts'

const png = readFileSync(new URL('../moonshot/valid-red-1x1.png', import.meta.url))

describe('Google certification image test material', () => {
  it.each(googleDefinitions)(
    '$modelId carries the verified PNG and keeps its full history',
    definition => {
      const request = googleCertificationRequest(definition.modelId)
      expect(request.messages).toHaveLength(5)
      expect(request.messages.some(message => message.type === 'assistant')).toBe(true)
      expect(request.messages.some(message => message.type === 'tool')).toBe(true)
      const final = request.messages.at(-1)
      if (!final || final.type !== 'user') throw new Error('missing image-bearing user turn')
      const image = final.blocks.find(block => block.kind === 'image')
      if (!image || image.kind !== 'image' || !('inline' in image.data))
        throw new Error('missing inline image')
      expect(Buffer.from(image.data.inline, 'base64')).toEqual(png)
      expect(image.mediaType).toBe('image/png')

      const meter = createGoogleInputMeter(definition)
      if (!meter) throw new Error('missing selected Google meter')
      const result = planRequest(
        { ...request, parameters: { maxOutputTokens: 64 } },
        [definition],
        meter,
      )
      expect(result).toEqual({
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxInputTokens'],
      })
    },
  )
})
