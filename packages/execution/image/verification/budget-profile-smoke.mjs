import { statSync } from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { imageBudget, open } from '@omne-harness/image'

const profile = {
  formats: ['image/png', 'image/jpeg', 'image/webp'],
  maxWidth: 8192,
  maxHeight: 8192,
  maxDecodedBytes: 64_000_000,
  maxConcurrentDecodes: 2,
  maxInFlightBytes: 268_435_456,
}

let peak = 0
const sampler = setInterval(() => {
  peak = Math.max(peak, process.memoryUsage().rss)
}, 5)
const mib = n => Number((n / 1048576).toFixed(1))
const rows = []
const mismatches = []

function budgetFor(input) {
  const created = imageBudget(input)
  if (created.kind !== 'budget') throw new Error(`budget rejected: ${created.reason}`)
  return created.budget
}

async function scenario(name, expected, fn, target = budget) {
  globalThis.gc?.()
  const before = process.memoryUsage().rss
  peak = before
  let outcome
  let detail
  try {
    ;({ outcome, detail } = await fn())
  } catch (error) {
    outcome = `threw:${error instanceof Error ? error.message : String(error)}`
  }
  peak = Math.max(peak, process.memoryUsage().rss)
  const held = target.heldReservation()
  const actual = { outcome, count: held.count, bytes: held.bytes }
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    mismatches.push({ name, expected, actual })
  rows.push({ name, ...actual, detail, rssBeforeMiB: mib(before), rssPeakMiB: mib(peak) })
}

const solid = (format, width, height) =>
  sharp({ create: { width, height, channels: 4, background: { r: 40, g: 120, b: 200, alpha: 1 } } })
    [format]()
    .toBuffer()

function noise(width, height) {
  const pixels = Buffer.allocUnsafe(width * height * 4)
  let state = 0x9e3779b9
  for (let i = 0; i < pixels.length; i += 4) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    pixels.writeUInt32LE(state >>> 0, i)
    pixels[i + 3] = 255
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}

const kind = opened =>
  opened.kind === 'opened'
    ? `opened ${opened.declaration.orientedWidth}x${opened.declaration.orientedHeight}`
    : `rejected:${opened.reason}`

async function encodedMatches(handle, format, width, height) {
  const encoded = await handle.encode({ format })
  if (encoded.kind !== 'encoded') return { ok: `${format}:${encoded.kind}:${encoded.reason}` }
  const meta = await sharp(encoded.bytes).metadata()
  const ok =
    encoded.mediaType === `image/${format}` &&
    meta.format === format &&
    meta.width === width &&
    meta.height === height
  return { ok: `${format}:${ok ? 'ok' : 'wrong'}`, bytes: encoded.bytes.byteLength }
}

const budget = budgetFor(profile)
const fixtures = {
  typical: await solid('png', 1920, 1080),
  jpeg: await solid('jpeg', 2048, 1536),
  webp: await solid('webp', 2048, 1536),
  gif: await solid('gif', 64, 64),
  solidAtPixelCap: await solid('png', 4000, 4000),
  noiseAtPixelCap: await noise(4000, 4000),
  pngOverPixelCap: await solid('png', 4001, 4000),
  pngAtWidth: await solid('png', 8192, 1953),
  pngAtHeight: await solid('png', 1953, 8192),
  pngOverWidth: await solid('png', 8193, 64),
  pngOverHeight: await solid('png', 64, 8193),
}
const empty = { count: 0, bytes: 0 }

await scenario(
  'png 1920x1080 open, encode jpeg, close',
  { outcome: 'opened 1920x1080 jpeg:ok closed', ...empty },
  async () => {
    const opened = await open({ bytes: fixtures.typical, budget })
    const encoded = await encodedMatches(opened.handle, 'jpeg', 1920, 1080)
    const closed = await opened.handle.close()
    return { outcome: `${kind(opened)} ${encoded.ok} ${closed.kind}` }
  },
)
for (const [key, outcome] of [
  ['jpeg', 'opened 2048x1536'],
  ['webp', 'opened 2048x1536'],
  ['gif', 'rejected:not-image'],
  ['pngAtWidth', 'opened 8192x1953'],
  ['pngAtHeight', 'opened 1953x8192'],
  ['pngOverPixelCap', 'rejected:decoded-bytes'],
  ['pngOverWidth', 'rejected:width'],
  ['pngOverHeight', 'rejected:height'],
]) {
  await scenario(`open ${key}`, { outcome, ...empty }, async () => {
    const opened = await open({ bytes: fixtures[key], budget })
    if (opened.kind === 'opened') await opened.handle.close()
    return { outcome: kind(opened) }
  })
}

const held = []
for (const [n, expected] of [
  [1, { outcome: 'opened 4000x4000', count: 1, bytes: 64_000_000 }],
  [2, { outcome: 'opened 4000x4000', count: 2, bytes: 128_000_000 }],
]) {
  await scenario(`hold noiseAtPixelCap #${n}`, expected, async () => {
    const opened = await open({ bytes: fixtures.noiseAtPixelCap, budget })
    held.push(opened.handle)
    return { outcome: kind(opened), detail: { verifiedBytes: opened.verifiedBytes.byteLength } }
  })
}
await scenario(
  'open png 1920x1080 while two are held',
  { outcome: 'rejected:concurrent', count: 2, bytes: 128_000_000 },
  async () => ({ outcome: kind(await open({ bytes: fixtures.typical, budget })) }),
)
await scenario(
  'encode png, jpeg, webp on held #1, with open and reading during each encode',
  {
    outcome:
      'png:ok held=2/128000000 open=rejected:concurrent jpeg:ok held=2/128000000 open=rejected:concurrent webp:ok held=2/128000000 open=rejected:concurrent',
    count: 2,
    bytes: 128_000_000,
  },
  async () => {
    const parts = []
    const detail = {}
    for (const format of ['png', 'jpeg', 'webp']) {
      const pending = encodedMatches(held[0], format, 4000, 4000)
      const during = budget.heldReservation()
      const openDuring = kind(await open({ bytes: fixtures.typical, budget }))
      const result = await pending
      detail[format] = result.bytes
      parts.push(`${result.ok} held=${during.count}/${during.bytes} open=${openDuring}`)
    }
    return { outcome: parts.join(' '), detail }
  },
)
await scenario('close held #1 and #2', { outcome: 'closed closed', ...empty }, async () => {
  const results = await Promise.all(held.splice(0).map(h => h.close()))
  return { outcome: results.map(r => r.kind).join(' ') }
})
await scenario(
  'caller stops waiting after 1 ms while another handle is held',
  {
    outcome: 'timeout held=2 third=rejected:concurrent opened 4000x4000 held=2 closed closed',
    ...empty,
  },
  async () => {
    const first = await open({ bytes: fixtures.solidAtPixelCap, budget })
    const pending = open({ bytes: fixtures.noiseAtPixelCap, budget })
    const raced = await Promise.race([pending, new Promise(r => setTimeout(() => r('timeout'), 1))])
    const atTimeout = budget.heldReservation().count
    const third = kind(await open({ bytes: fixtures.typical, budget }))
    const opened = await pending
    const atSettle = budget.heldReservation().count
    const closed = await Promise.all([first.handle.close(), opened.handle.close()])
    return {
      outcome: `${raced === 'timeout' ? 'timeout' : raced.kind} held=${atTimeout} third=${third} ${kind(opened)} held=${atSettle} ${closed.map(c => c.kind).join(' ')}`,
    }
  },
)

const withoutWebp = budgetFor({ ...profile, formats: ['image/png', 'image/jpeg'] })
await scenario(
  'variant without webp: open webp',
  { outcome: 'rejected:format', ...empty },
  async () => ({ outcome: kind(await open({ bytes: fixtures.webp, budget: withoutWebp })) }),
  withoutWebp,
)
const fiveWide = budgetFor({ ...profile, maxConcurrentDecodes: 5 })
await scenario(
  'variant with five concurrent: fifth full-size open',
  {
    outcome: 'opened opened opened opened rejected:in-flight-bytes',
    count: 4,
    bytes: 256_000_000,
  },
  async () => {
    const outcomes = []
    for (let i = 0; i < 5; i += 1) {
      const opened = await open({ bytes: fixtures.solidAtPixelCap, budget: fiveWide })
      if (opened.kind === 'opened') held.push(opened.handle)
      outcomes.push(opened.kind === 'opened' ? 'opened' : `rejected:${opened.reason}`)
    }
    return { outcome: outcomes.join(' ') }
  },
  fiveWide,
)
await Promise.all(held.splice(0).map(h => h.close()))

clearInterval(sampler)
const entry = fileURLToPath(import.meta.resolve('@omne-harness/image'))
console.log(
  JSON.stringify(
    {
      environment: {
        node: process.version,
        platform: `${os.type()} ${os.release()} ${os.arch()}`,
        cpus: os.cpus().length,
        totalMemMiB: mib(os.totalmem()),
        sharp: sharp.versions.sharp,
        libvips: sharp.versions.vips,
        sharpConcurrency: sharp.concurrency(),
        sharpCache: sharp.cache(),
        uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE ?? 'unset',
        glibcRuntime: process.report.getReport().header.glibcVersionRuntime ?? 'n/a',
        gcExposed: typeof globalThis.gc === 'function',
        entry,
        entryModified: statSync(entry).mtime.toISOString(),
      },
      profile,
      rows,
      mismatches,
    },
    null,
    2,
  ),
)
process.exitCode = mismatches.length === 0 ? 0 : 1
