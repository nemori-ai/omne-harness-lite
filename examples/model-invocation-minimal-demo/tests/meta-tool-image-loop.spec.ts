// @module-tag slow
// The original TLS transport, actual host Files tool, custody and cold recovery run together.
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { openDemo } from '../src/demo.ts'
import { createLocalTls } from './local-tls.ts'
import { demoRetirement } from './model-request-support.ts'

function imageBytes(body: unknown): Buffer {
  const found = /data:image\/png;base64,([A-Za-z0-9+/=]+)/u.exec(JSON.stringify(body))
  if (!found?.[1]) throw new Error('Actual image carrier missing')
  return Buffer.from(found[1], 'base64')
}

it('sends original Files.open image bytes and preserves the reference for cold continuation', async () => {
  const parent = resolve('tmp/tool-runtime-loop/meta-tool-image-tests')
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const root = await mkdtemp(join(parent, 'image-'))
  const path = join(root, 'sample.png')
  await sharp({ create: { width: 24, height: 16, channels: 3, background: '#2468ac' } })
    .png()
    .toFile(path)
  const expected = await sharp(path).raw().toBuffer()
  const tls = await createLocalTls(join(root, 'tls'))
  tls.setToolCall('Files', { command: 'open', args: { path } })
  let demo: Awaited<ReturnType<typeof openDemo>> | undefined
  const start = () =>
    openDemo(
      join(root, 'data'),
      { multiplier: 1.1, reserveTokens: 256 },
      demoRetirement(),
      4096,
      Buffer.from('controlled-image-demo-key'),
      { developmentTransport: tls.developmentTransport },
      undefined,
      undefined,
      true,
    )
  try {
    demo = await start()
    const opened = await demo.send('Open the image with Files.', async () => {})
    expect(opened.kind, 'reason' in opened ? opened.reason : opened.kind).toBe('saved')
    expect(tls.requests).toHaveLength(2)
    expect(await sharp(imageBytes(tls.requests[1]!.body)).raw().toBuffer()).toEqual(expected)
    const log = await demo.application.readSessionLog(demo.actor, demo.session)
    if (!('entries' in log)) throw new Error('Actual session log missing')
    const serialized = JSON.stringify(log.entries)
    expect(serialized).toContain('"kind":"image"')
    expect(serialized).toContain('"storage":"demo-results"')
    expect(serialized).not.toContain('data:image/png;base64,')
    expect((await demo.close()).complete).toBe(true)
    demo = undefined
    tls.setMode('complete')
    demo = await start()
    const continued = await demo.send(
      'Look again at the previous image. Do not call a tool.',
      async () => {},
    )
    expect(continued.kind, 'reason' in continued ? continued.reason : continued.kind).toBe('saved')
    expect(tls.requests).toHaveLength(3)
    expect(await sharp(imageBytes(tls.requests[2]!.body)).raw().toBuffer()).toEqual(expected)
    expect((await demo.close()).complete).toBe(true)
  } finally {
    if (demo) await demo.close()
    await tls.close()
  }
}, 180_000)
