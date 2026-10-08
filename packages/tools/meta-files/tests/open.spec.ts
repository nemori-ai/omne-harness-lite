import sharp from 'sharp'
import { expect, test, vi } from 'vitest'
import { contentBlockFromRepresentation } from '@omne-harness-lite/content-blocks'
import { createSharpImageCodec } from '@omne-harness-lite/image-codec'
import { createFilesTool } from '../src/index.ts'
import { fixture, options, text } from './fixture.ts'
function reference() {
  const block = contentBlockFromRepresentation({
    id: 'saved',
    kind: 'file',
    visibility: { toHuman: true, toModel: true },
    attachment: { storage: 'tool-results', key: 'original', mediaType: 'image/png' },
  })
  if (block.kind !== 'file') throw new Error('fixture reference')
  return block.attachment
}
async function bytes() {
  return sharp({ create: { width: 3, height: 4, channels: 3, background: 'blue' } })
    .png()
    .toBuffer()
}
test('open validates real raster, confirms original bytes and returns an image reference without base64 or emit', async () => {
  const h = fixture(),
    image = await bytes(),
    ref = reference()
  h.seed('a.png', image)
  const putAttachment = vi.fn(async () => ({ kind: 'stored' as const, reference: ref }))
  const result = await h.tool.executor(
    { command: 'open', args: { path: 'a.png' } },
    { ...h.deps, attachments: { putAttachment } },
  )
  expect(putAttachment).toHaveBeenCalledWith(
    'files.open.image',
    new Uint8Array(image),
    'image/png',
    '/work/a.png',
  )
  expect(result).toHaveProperty('attachments', [ref])
  expect(result).toHaveProperty('content.1.data', ref)
  expect(result).toHaveProperty('content.0.visibility', { toHuman: true, toModel: true })
  expect(result).toHaveProperty('content.1.visibility', { toHuman: true, toModel: true })
  expect(result).not.toHaveProperty('isError', true)
  expect(text(result)).toContain('Image attachment confirmed')
  expect(text(result)).not.toContain(image.toString('base64'))
  expect(h.deps.frames.emit).not.toHaveBeenCalled()
})
test.each(['receiptUnknown', 'notAuthorized', 'undeclaredStorage'] as const)(
  'unconfirmed %s attachment yields no fabricated image reference',
  async reason => {
    const h = fixture()
    h.seed('a.png', await bytes())
    const result = await h.tool.executor(
      { command: 'open', args: { path: 'a.png' } },
      {
        ...h.deps,
        attachments: { putAttachment: vi.fn(async () => ({ kind: 'rejected' as const, reason })) },
      },
    )
    expect(result).toHaveProperty('isError', true)
    expect(text(result)).toContain(`attachment:${reason}`)
    expect(result).not.toHaveProperty('attachments')
    expect(text(result)).toContain('does not prove')
  },
)
test('bad, oversized and animated data is rejected before attachment effects', async () => {
  const h = fixture({ maxImagePixels: 1 }),
    putAttachment = vi.fn(async () => ({ kind: 'stored' as const, reference: reference() }))
  h.seed('bad', 'not an image')
  expect(
    text(
      await h.tool.executor(
        { command: 'open', args: { path: 'bad' } },
        { ...h.deps, attachments: { putAttachment } },
      ),
    ),
  ).toContain('ERROR: image:')
  h.seed('big', await bytes())
  expect(
    text(
      await h.tool.executor(
        { command: 'open', args: { path: 'big' } },
        { ...h.deps, attachments: { putAttachment } },
      ),
    ),
  ).toContain('imageDimensions')
  const codec = createSharpImageCodec(sharp)
  const tool = createFilesTool(options, {
    imageCodec: {
      ...codec,
      inspect: async () => ({
        ok: {
          mediaType: 'image/png',
          width: 3,
          height: 4,
          pages: 2,
          orientation: 1,
          hasAlpha: false,
        },
      }),
    },
  })
  expect(
    text(
      await tool.executor(
        { command: 'open', args: { path: 'big' } },
        { ...h.deps, attachments: { putAttachment } },
      ),
    ),
  ).toContain('animatedUnsupported')
  expect(putAttachment).not.toHaveBeenCalled()
})
test('cancel during decode waits for original close and does not publish an image', async () => {
  const h = fixture(),
    codec = createSharpImageCodec(sharp)
  h.seed('a.png', await bytes())
  const pending = Promise.withResolvers<void>(),
    entered = Promise.withResolvers<void>(),
    close = vi.fn(async () => {
      entered.resolve()
      await pending.promise
    })
  const tool = createFilesTool(options, {
    imageCodec: {
      ...codec,
      decode: async (bytes, meta, limits) => {
        const original = await codec.decode(bytes, meta, limits)
        if ('failure' in original) return original
        h.controller.abort()
        return {
          ok: {
            ...original.ok,
            close: async () => {
              await close()
              await original.ok.close()
            },
          },
        }
      },
    },
  })
  const putAttachment = vi.fn(async () => ({ kind: 'stored' as const, reference: reference() }))
  const task = tool.executor(
    { command: 'open', args: { path: 'a.png' } },
    { ...h.deps, attachments: { putAttachment } },
  )
  await entered.promise
  expect(putAttachment).not.toHaveBeenCalled()
  pending.resolve()
  expect(text(await task)).toContain('ERROR: interrupted')
  expect(close).toHaveBeenCalledOnce()
  expect(putAttachment).not.toHaveBeenCalled()
})
test('native unexpected errors propagate and do not become notFound', async () => {
  const h = fixture()
  h.seed('a.png', await bytes())
  const codec = createSharpImageCodec(sharp),
    tool = createFilesTool(options, {
      imageCodec: {
        ...codec,
        decode: async () => {
          throw new Error('native failure')
        },
      },
    })
  await expect(
    tool.executor(
      { command: 'open', args: { path: 'a.png' } },
      { ...h.deps, attachments: { putAttachment: vi.fn() } },
    ),
  ).rejects.toThrow('native failure')
})
