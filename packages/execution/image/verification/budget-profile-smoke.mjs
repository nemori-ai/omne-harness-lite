import os from 'node:os'
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

async function scenario(name, expected, fn) {
  globalThis.gc?.()
  const before = process.memoryUsage().rss
  peak = before
  const { outcome, detail } = await fn()
  peak = Math.max(peak, process.memoryUsage().rss)
  const held = budget.heldReservation()
  const actual = { outcome, count: held.count, bytes: held.bytes }
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    mismatches.push({ name, expected, actual })
  rows.push({ name, ...actual, detail, rssBeforeMiB: mib(before), rssPeakMiB: mib(peak) })
}

const fixture = (format, width, height) =>
  sharp({ create: { width, height, channels: 4, background: { r: 40, g: 120, b: 200, alpha: 1 } } })
    [format]()
    .toBuffer()

const created = imageBudget(profile)
if (created.kind !== 'budget') throw new Error(`profile rejected: ${created.reason}`)
const budget = created.budget

const fixtures = {
  typical: await fixture('png', 1920, 1080),
  jpeg: await fixture('jpeg', 2048, 1536),
  webp: await fixture('webp', 2048, 1536),
  gif: await fixture('gif', 64, 64),
  pngAtPixelCap: await fixture('png', 4000, 4000),
  pngOverPixelCap: await fixture('png', 4001, 4000),
  pngAtWidth: await fixture('png', 8192, 1953),
  pngOverWidth: await fixture('png', 8193, 64),
  pngOverHeight: await fixture('png', 64, 8193),
}
const kind = opened => (opened.kind === 'opened' ? 'opened' : `rejected:${opened.reason}`)
const empty = { count: 0, bytes: 0 }

await scenario(
  'png 1920x1080 open, encode jpeg, close',
  { outcome: 'opened encoded closed', ...empty },
  async () => {
    const opened = await open({ bytes: fixtures.typical, budget })
    const encoded = await opened.handle.encode({ format: 'jpeg' })
    const closed = await opened.handle.close()
    return { outcome: `${opened.kind} ${encoded.kind} ${closed.kind}` }
  },
)
for (const [key, outcome] of [
  ['jpeg', 'opened'],
  ['webp', 'opened'],
  ['gif', 'rejected:not-image'],
  ['pngAtWidth', 'opened'],
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
  [1, { outcome: 'opened', count: 1, bytes: 64_000_000 }],
  [2, { outcome: 'opened', count: 2, bytes: 128_000_000 }],
]) {
  await scenario(`hold pngAtPixelCap #${n}`, expected, async () => {
    const opened = await open({ bytes: fixtures.pngAtPixelCap, budget })
    held.push(opened.handle)
    return { outcome: kind(opened) }
  })
}
await scenario(
  'open png 1920x1080 while two are held',
  { outcome: 'rejected:concurrent', count: 2, bytes: 128_000_000 },
  async () => {
    const opened = await open({ bytes: fixtures.typical, budget })
    return { outcome: kind(opened) }
  },
)
await scenario(
  'encode png, jpeg, webp on held #1',
  { outcome: 'encoded encoded encoded', count: 2, bytes: 128_000_000 },
  async () => {
    const results = []
    for (const format of ['png', 'jpeg', 'webp']) results.push(await held[0].encode({ format }))
    return {
      outcome: results.map(r => r.kind).join(' '),
      detail: Object.fromEntries(
        results.map((r, i) => [['png', 'jpeg', 'webp'][i], r.bytes.byteLength]),
      ),
    }
  },
)
await scenario('close held #1 and #2', { outcome: 'closed closed', ...empty }, async () => {
  const results = await Promise.all(held.map(h => h.close()))
  return { outcome: results.map(r => r.kind).join(' ') }
})
await scenario(
  'caller stops waiting after 1 ms, then closes',
  { outcome: 'timeout held=1 opened held=1 closed', ...empty },
  async () => {
    const pending = open({ bytes: fixtures.pngAtPixelCap, budget })
    const raced = await Promise.race([pending, new Promise(r => setTimeout(() => r('timeout'), 1))])
    const atTimeout = budget.heldReservation().count
    const opened = await pending
    const atSettle = budget.heldReservation().count
    const closed = await opened.handle.close()
    return {
      outcome: `${raced === 'timeout' ? 'timeout' : raced.kind} held=${atTimeout} ${opened.kind} held=${atSettle} ${closed.kind}`,
    }
  },
)

clearInterval(sampler)
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
