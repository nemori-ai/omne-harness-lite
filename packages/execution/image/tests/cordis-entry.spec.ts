import { Context, ValidationError } from '@deepseek-ai/cordis'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { imagePlugin, type ImageService } from '@omne-harness/image/cordis'

const config = {
  formats: ['image/png', 'image/jpeg', 'image/webp'],
  maxWidth: 64,
  maxHeight: 64,
  maxDecodedBytes: 64 * 64 * 4,
  maxConcurrentDecodes: 2,
  maxInFlightBytes: 64 * 64 * 4 * 2,
} as const

it('fails plugin load when a ceiling is missing or not a positive finite number', async () => {
  const root = new Context()
  const missing = root.plugin(imagePlugin, { formats: ['image/png'] } as never)
  await expect(missing).rejects.toBeInstanceOf(ValidationError)
  expect(missing.state).toBe(3)
  await missing.dispose()

  const zero = root.plugin(imagePlugin, { ...config, maxWidth: 0 })
  await expect(zero).rejects.toBeInstanceOf(ValidationError)
  await zero.dispose()

  const infinite = root.plugin(imagePlugin, {
    ...config,
    maxInFlightBytes: Number.POSITIVE_INFINITY,
  })
  await expect(infinite).rejects.toBeInstanceOf(ValidationError)
  await infinite.dispose()
})

it('opens through the image service and leaves an open handle open after dispose', async () => {
  const root = new Context()
  const fiber = await root.plugin(imagePlugin, config)
  expect(fiber.state).toBe(2)
  const image = root.get('image') as ImageService
  expect(Object.keys(image).sort()).toEqual(['budget', 'open'])
  const bytes = await sharp({
    create: { width: 8, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer()
  const opened = await image.open(bytes)
  expect(opened.kind).toBe('opened')
  if (opened.kind !== 'opened') return
  const encoded = await opened.handle.encode({ format: 'webp' })
  expect(encoded.kind).toBe('encoded')
  expect(image.budget.heldReservation()).toEqual({ count: 1, bytes: 8 * 4 * 4 })
  await fiber.dispose()
  expect(opened.handle.phase).toBe('open')
  expect(image.budget.heldReservation()).toEqual({ count: 1, bytes: 8 * 4 * 4 })
  await opened.handle.close()
  expect(image.budget.heldReservation()).toEqual({ count: 0, bytes: 0 })
})

it('publishes no event surface on the plugin definition', () => {
  expect(Object.keys(imagePlugin).sort()).toEqual(['Config', 'apply', 'name'])
  expect('inject' in imagePlugin).toBe(false)
})

it('keeps a single image provider in one isolate', async () => {
  const root = new Context()
  await root.plugin(imagePlugin, config)
  const second = root.plugin(imagePlugin, config)
  await expect(second).rejects.toBeTruthy()
  await second.dispose()
})
