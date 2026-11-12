// S4, the byte range of a page. Every text over a small alphabet of 1-, 2-, 3- and 4-byte
// characters up to three characters long is put in a package five ways: as a text resource, as
// a binary resource (one 0xFF byte in front), and as the body of `SKILL.md` behind an LF and a
// CRLF frontmatter, and as a `SKILL.md` without a frontmatter, whose body is not known: every
// read of it answers `source-unavailable` alone. Each is read through the real
// `read` with every start and length up to two past the total, the page limit and one more, and
// no range. One more package holds a region longer than a page with characters across the page
// limit. The expected page comes from the rules of the contract SPEC "读取的形状规则": the actual
// start is the first character boundary at or after the requested start, the actual end the
// last boundary at or before the requested start plus the requested length (at most the page
// limit), never before the start; `complete` holds exactly when the end reaches the total. An
// illegal range throws a TypeError before any port is called.
import { isDeepStrictEqual } from 'node:util'
import {
  isAssetVersion,
  isSkillName,
  PAGE_LIMIT,
  type ByteRange,
} from '@omne-harness/skill-contract'
import { createSkillAccess } from '@omne-harness/skill'
import {
  createMemoryReadCheck,
  createMemoryResolution,
  createMemorySource,
} from '@omne-harness/skill-contract/testing'
import { Ledger, type Report } from './explore.ts'
import { alice, CAPABILITY, locatorOf, scope, sealedOf, type Files } from './world.ts'
import { granted, tool } from '../access-world.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
const ALPHABET = ['a', 'é', '中', '😀']
const LF_HEADER = '---\nname: alpha\n---\n'
const CRLF_HEADER = '---\r\nname: alpha\r\n---\r\n'

/** Every text over the alphabet with at most `size` characters. */
function texts(size: number): string[] {
  const all = ['']
  let layer = ['']
  for (let length = 1; length <= size; length += 1) {
    layer = layer.flatMap(prefix => ALPHABET.map(item => prefix + item))
    all.push(...layer)
  }
  return all
}

/** A read service over one package of `alpha`, and the count of port calls. */
function serviceOf(files: Files) {
  const sealed = sealedOf('alpha', files)
  let calls = 0
  const readCheck = createMemoryReadCheck([{ capability: CAPABILITY.alpha, visible: () => true }])
  const resolution = createMemoryResolution([
    {
      capability: CAPABILITY.alpha,
      visible: () => true,
      state: {
        kind: 'adopted',
        current: {
          ref: {
            capability: CAPABILITY.alpha,
            layer: 'tenant',
            assetVersion: granted(isAssetVersion, 'v0'),
            locator: locatorOf('alpha'),
            digest: sealed.digest,
          },
          declared: {
            name: granted(isSkillName, 'alpha'),
            tools: [tool('read-file')],
            scripts: [],
            settings: [],
          },
        },
      },
    },
  ])
  const source = createMemorySource([{ locator: locatorOf('alpha'), rootName: 'alpha', files }])
  const counted =
    <A extends unknown[], R>(call: (...args: A) => R) =>
    (...args: A): R => {
      calls += 1
      return call(...args)
    }
  const access = createSkillAccess({
    readCheck: { check: counted(readCheck.check) },
    resolution: { resolve: counted(resolution.resolve), adopted: counted(resolution.adopted) },
    source: { snapshot: counted(source.snapshot), open: counted(source.open) },
  })
  return { access, calls: () => calls, entries: sealed.entries }
}

/** `headerless`: a body without a legal frontmatter, which no range may read. */
type Region = Readonly<{
  part: 'body' | string
  bytes: Uint8Array
  text: boolean
  headerless?: boolean
}>

const SOURCE_UNAVAILABLE = { failure: { kind: 'source-unavailable' } }

function isBoundary(region: Region, at: number): boolean {
  return !region.text || at >= region.bytes.length || ((region.bytes[at] ?? 0) & 0xc0) !== 0x80
}

/** The page that the contract rules give for `requested` on `region`. */
function expectedPage(region: Region, requested: ByteRange | undefined) {
  const total = region.bytes.length
  const requestedStart = requested?.start ?? 0
  const requestedEnd = requestedStart + Math.min(requested?.length ?? PAGE_LIMIT, PAGE_LIMIT)
  let start = Math.min(requestedStart, total)
  while (!isBoundary(region, start)) start += 1
  let end = Math.min(requestedEnd, total)
  while (end > start && !isBoundary(region, end)) end -= 1
  end = Math.max(start, end)
  const slice = region.bytes.slice(start, end)
  return {
    content: region.text
      ? { kind: 'text', text: decoder.decode(slice) }
      : { kind: 'bytes', bytes: slice },
    range: { start, length: end - start },
    total,
    complete: end >= total,
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

/** The property breaks of one page, beside the exact expectation. */
function pageBreaks(region: Region, page: unknown): string[] {
  const range = field(page, 'range')
  const start = Number(field(range, 'start'))
  const length = Number(field(range, 'length'))
  const total = Number(field(page, 'total'))
  const breaks: string[] = []
  if (!isBoundary(region, start) || !isBoundary(region, start + length))
    breaks.push('a range end is not a character boundary')
  if (length > PAGE_LIMIT) breaks.push('a page longer than PAGE_LIMIT')
  if (field(page, 'complete') !== start + length >= total)
    breaks.push('complete is not "the end reaches the total"')
  return breaks
}

const ILLEGAL: readonly ByteRange[] = [
  { start: -1, length: 1 },
  { start: 0, length: -1 },
  { start: 0.5, length: 1 },
  { start: 0, length: 1.5 },
  { start: Number.NaN, length: 1 },
  { start: 0, length: Number.POSITIVE_INFINITY },
]

async function readAll(
  ledger: Ledger,
  files: Files,
  regions: readonly Region[],
  ranges: (total: number) => readonly (ByteRange | undefined)[],
): Promise<void> {
  const service = serviceOf(files)
  for (const region of regions) {
    const target = {
      capability: CAPABILITY.alpha,
      part:
        region.part === 'body'
          ? ({ kind: 'body' } as const)
          : ({ kind: 'resource', path: region.part } as const),
    }
    for (const range of ranges(region.bytes.length)) {
      const where = `${JSON.stringify(files)} ${region.part} ${JSON.stringify(range)}`
      ledger.count()
      let outcome: Awaited<ReturnType<typeof service.access.read>>
      try {
        outcome = await service.access.read(
          alice,
          scope,
          target,
          range === undefined ? {} : { range },
        )
      } catch (error) {
        ledger.break({ world: where, request: 'read', detail: `threw ${String(error)}` })
        continue
      }
      if (region.headerless === true) {
        if (!isDeepStrictEqual(outcome, SOURCE_UNAVAILABLE))
          ledger.break({
            world: where,
            request: 'read',
            detail: `a body without a frontmatter answered ${JSON.stringify(outcome)}`,
          })
        continue
      }
      if (!('ok' in outcome)) {
        ledger.break({
          world: where,
          request: 'read',
          detail: `failed: ${JSON.stringify(outcome)}`,
        })
        continue
      }
      const { content, range: actual, total, complete } = outcome.ok
      const expected = expectedPage(region, range)
      if (!isDeepStrictEqual({ content, range: actual, total, complete }, expected))
        ledger.break({
          world: where,
          request: 'read',
          detail: `page ${JSON.stringify({ content, range: actual, total, complete })}, the rules give ${JSON.stringify(expected)}`,
        })
      for (const broken of pageBreaks(region, outcome.ok))
        ledger.break({ world: where, request: 'read', detail: broken })
    }
    for (const range of ILLEGAL) {
      const before = service.calls()
      let thrown = 'nothing'
      try {
        await service.access.read(alice, scope, target, { range })
      } catch (error) {
        thrown = error instanceof Error ? error.name : 'non-error'
      }
      ledger.count()
      if (thrown !== 'TypeError' || service.calls() !== before)
        ledger.break({
          world: JSON.stringify(files),
          request: `read ${region.part} ${JSON.stringify(range)}`,
          detail: `threw ${thrown} after ${service.calls() - before} port calls`,
        })
    }
  }
}

/** Every start and length up to two past the total, the page limit and one more, and no range. */
function smallRanges(total: number): (ByteRange | undefined)[] {
  const ranges: (ByteRange | undefined)[] = [undefined]
  for (let start = 0; start <= total + 2; start += 1)
    for (const length of [
      ...Array.from({ length: total + 3 }, (_, index) => index),
      PAGE_LIMIT,
      PAGE_LIMIT + 1,
    ])
      ranges.push({ start, length })
  return ranges
}

function largeRanges(total: number): (ByteRange | undefined)[] {
  const starts = [
    0,
    1,
    PAGE_LIMIT - 3,
    PAGE_LIMIT - 2,
    PAGE_LIMIT - 1,
    PAGE_LIMIT,
    PAGE_LIMIT + 1,
    PAGE_LIMIT + 2,
    total - 1,
    total,
    total + 1,
  ]
  const lengths = [0, 1, 2, 3, PAGE_LIMIT - 1, PAGE_LIMIT, PAGE_LIMIT + 1, 2 * PAGE_LIMIT]
  return [undefined, ...starts.flatMap(start => lengths.map(length => ({ start, length })))]
}

export async function exploreRange(): Promise<Report> {
  const ledger = new Ledger('S4 byte range')
  for (const text of texts(3)) {
    const bytes = encoder.encode(text)
    const binary = Uint8Array.of(0xff, ...bytes)
    await readAll(
      ledger,
      { 'SKILL.md': LF_HEADER + text, 'docs/r.md': text, 'docs/r.bin': binary },
      [
        { part: 'body', bytes, text: true },
        { part: 'docs/r.md', bytes, text: true },
        { part: 'docs/r.bin', bytes: binary, text: false },
      ],
      smallRanges,
    )
    await readAll(
      ledger,
      { 'SKILL.md': CRLF_HEADER + text },
      [{ part: 'body', bytes, text: true }],
      smallRanges,
    )
    if (text !== '')
      await readAll(
        ledger,
        { 'SKILL.md': text },
        [{ part: 'body', bytes, text: true, headerless: true }],
        smallRanges,
      )
  }
  // A closing line without a line terminator: the body starts at the end.
  await readAll(
    ledger,
    { 'SKILL.md': '---\nname: alpha\n---' },
    [{ part: 'body', bytes: new Uint8Array(), text: true }],
    smallRanges,
  )
  const long = `${'a'.repeat(PAGE_LIMIT - 2)}中é😀${'b'.repeat(5)}`
  const longBytes = encoder.encode(long)
  await readAll(
    ledger,
    { 'SKILL.md': LF_HEADER + long, 'docs/long.md': long },
    [
      { part: 'body', bytes: longBytes, text: true },
      { part: 'docs/long.md', bytes: longBytes, text: true },
    ],
    largeRanges,
  )
  return ledger.report()
}
