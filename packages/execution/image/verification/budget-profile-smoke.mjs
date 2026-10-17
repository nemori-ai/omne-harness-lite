import { statSync } from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
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
const SCENARIO_TIMEOUT_MS = 120_000

let peak = 0
const sampler = setInterval(() => {
  peak = Math.max(peak, process.memoryUsage().rss)
}, 5)
sampler.unref()
const mib = n => Number((n / 1048576).toFixed(1))
const rows = []
const mismatches = []
const mediaTypes = new Map()
const empty = { count: 0, bytes: 0 }

function budgetFor(input) {
  const created = imageBudget(input)
  if (created.kind !== 'budget') throw new Error(`budget rejected: ${created.reason}`)
  return created.budget
}

async function scenario(name, expected, target, fn) {
  globalThis.gc?.()
  const before = process.memoryUsage().rss
  peak = before
  let outcome
  let detail
  const timer = delay(SCENARIO_TIMEOUT_MS, { outcome: 'timeout' }, { ref: false })
  try {
    ;({ outcome, detail } = await Promise.race([fn(), timer]))
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

async function solid(format, width, height) {
  const bytes = await sharp({
    create: { width, height, channels: 4, background: { r: 40, g: 120, b: 200, alpha: 1 } },
  })
    [format]()
    .toBuffer()
  mediaTypes.set(bytes, `image/${format}`)
  return bytes
}

async function noise(width, height) {
  const pixels = Buffer.allocUnsafe(width * height * 4)
  let state = 0x9e3779b9
  for (let i = 0; i < pixels.length; i += 4) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    pixels.writeUInt32LE(state >>> 0, i)
    pixels[i + 3] = 255
  }
  const bytes = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
  mediaTypes.set(bytes, 'image/png')
  return bytes
}

function kind(opened, input) {
  if (opened.kind !== 'opened') return `rejected:${opened.reason}`
  const { declaration, verifiedBytes } = opened
  const faithful =
    declaration.mediaType === mediaTypes.get(input) &&
    declaration.trusted === false &&
    verifiedBytes !== input &&
    Buffer.from(verifiedBytes.buffer, verifiedBytes.byteOffset, verifiedBytes.byteLength).equals(
      input,
    )
  return `opened ${declaration.orientedWidth}x${declaration.orientedHeight}${faithful ? '' : ' unfaithful'}`
}

async function encodedMatches(handle, format, width, height) {
  const encoded = await handle.encode({ format })
  if (encoded.kind !== 'encoded') return { ok: `${format}:${encoded.kind}:${encoded.reason}` }
  const meta = await sharp(encoded.bytes).metadata()
  const ok =
    encoded.mediaType === `image/${format}` &&
    encoded.orientation === 'absent' &&
    encoded.exif === 'absent' &&
    meta.format === format &&
    meta.width === width &&
    meta.height === height &&
    meta.orientation === undefined &&
    meta.exif === undefined
  return { ok: `${format}:${ok ? 'ok' : 'wrong'}`, bytes: encoded.bytes.byteLength }
}

async function run() {
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
  const openKind = async (bytes, target = budget) =>
    kind(await open({ bytes, budget: target }), bytes)

  await scenario(
    'png 1920x1080 open, encode jpeg, close',
    { outcome: 'opened 1920x1080 jpeg:ok closed', ...empty },
    budget,
    async () => {
      const opened = await open({ bytes: fixtures.typical, budget })
      const encoded = await encodedMatches(opened.handle, 'jpeg', 1920, 1080)
      const closed = await opened.handle.close()
      return { outcome: `${kind(opened, fixtures.typical)} ${encoded.ok} ${closed.kind}` }
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
    await scenario(`open ${key}`, { outcome, ...empty }, budget, async () => {
      const opened = await open({ bytes: fixtures[key], budget })
      if (opened.kind === 'opened') await opened.handle.close()
      return { outcome: kind(opened, fixtures[key]) }
    })
  }

  const held = []
  for (const [n, expected] of [
    [1, { outcome: 'opened 4000x4000', count: 1, bytes: 64_000_000 }],
    [2, { outcome: 'opened 4000x4000', count: 2, bytes: 128_000_000 }],
  ]) {
    await scenario(`hold noiseAtPixelCap #${n}`, expected, budget, async () => {
      const opened = await open({ bytes: fixtures.noiseAtPixelCap, budget })
      if (opened.kind === 'opened') held.push(opened.handle)
      return {
        outcome: kind(opened, fixtures.noiseAtPixelCap),
        detail: { verifiedBytes: opened.verifiedBytes?.byteLength },
      }
    })
  }
  await scenario(
    'open png 1920x1080 while two are held',
    { outcome: 'rejected:concurrent', count: 2, bytes: 128_000_000 },
    budget,
    async () => ({ outcome: await openKind(fixtures.typical) }),
  )
  await scenario(
    'encode png, jpeg, webp on held #1, with open and reading during each encode',
    {
      outcome:
        'png:ok held=2/128000000 open=rejected:concurrent jpeg:ok held=2/128000000 open=rejected:concurrent webp:ok held=2/128000000 open=rejected:concurrent',
      count: 2,
      bytes: 128_000_000,
    },
    budget,
    async () => {
      const parts = []
      const detail = {}
      for (const format of ['png', 'jpeg', 'webp']) {
        let settled = false
        const pending = encodedMatches(held[0], format, 4000, 4000).finally(() => {
          settled = true
        })
        pending.catch(() => {})
        await delay(10)
        const during = budget.heldReservation()
        detail[`${format}SettledBeforeReading`] = settled
        const openDuring = await openKind(fixtures.typical)
        const result = await pending
        detail[format] = result.bytes
        parts.push(`${result.ok} held=${during.count}/${during.bytes} open=${openDuring}`)
      }
      return { outcome: parts.join(' '), detail }
    },
  )
  await scenario(
    'close held #1 and #2',
    { outcome: 'closed closed', ...empty },
    budget,
    async () => {
      const results = await Promise.all(held.splice(0).map(h => h.close()))
      return { outcome: results.map(r => r.kind).join(' ') }
    },
  )
  await scenario(
    'caller stops waiting after 1 ms while another handle is held',
    {
      outcome: 'timeout held=2 third=rejected:concurrent opened 4000x4000 held=2 closed closed',
      ...empty,
    },
    budget,
    async () => {
      const first = await open({ bytes: fixtures.solidAtPixelCap, budget })
      const pending = open({ bytes: fixtures.noiseAtPixelCap, budget })
      const raced = await Promise.race([pending, delay(1, 'timeout')])
      const atTimeout = budget.heldReservation().count
      const third = await openKind(fixtures.typical)
      const opened = await pending
      const atSettle = budget.heldReservation().count
      const closed = await Promise.all([first.handle.close(), opened.handle.close()])
      return {
        outcome: `${raced === 'timeout' ? 'timeout' : raced.kind} held=${atTimeout} third=${third} ${kind(opened, fixtures.noiseAtPixelCap)} held=${atSettle} ${closed.map(c => c.kind).join(' ')}`,
      }
    },
  )

  const withoutWebp = budgetFor({ ...profile, formats: ['image/png', 'image/jpeg'] })
  await scenario(
    'variant without webp: open webp',
    { outcome: 'rejected:format', ...empty },
    withoutWebp,
    async () => ({ outcome: await openKind(fixtures.webp, withoutWebp) }),
  )
  const fiveWide = budgetFor({ ...profile, maxConcurrentDecodes: 5 })
  const wide = []
  await scenario(
    'variant with five concurrent: fifth full-size open',
    {
      outcome: 'opened opened opened opened rejected:in-flight-bytes',
      count: 4,
      bytes: 256_000_000,
    },
    fiveWide,
    async () => {
      const outcomes = []
      for (let i = 0; i < 5; i += 1) {
        const opened = await open({ bytes: fixtures.solidAtPixelCap, budget: fiveWide })
        if (opened.kind === 'opened') wide.push(opened.handle)
        outcomes.push(opened.kind === 'opened' ? 'opened' : `rejected:${opened.reason}`)
      }
      return { outcome: outcomes.join(' ') }
    },
  )
  await scenario(
    'variant with five concurrent: close the four handles',
    { outcome: 'closed closed closed closed', ...empty },
    fiveWide,
    async () => {
      const results = await Promise.all(wide.splice(0).map(h => h.close()))
      return { outcome: results.map(r => r.kind).join(' ') }
    },
  )
}

let fatal
try {
  await run()
} catch (error) {
  fatal = error instanceof Error ? error.stack : String(error)
}
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
      fatal,
    },
    null,
    2,
  ),
)
process.exitCode = mismatches.length === 0 && fatal === undefined ? 0 : 1
