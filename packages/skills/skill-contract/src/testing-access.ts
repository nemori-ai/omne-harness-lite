// The conformance suite of `SkillAccess`. It takes a service over doubles that the implementer
// built, and checks the read steps of the group page "读取" and the shape rules of the SPEC
// "读取的形状规则" from the outside: non-disclosure, the basis, no partial content, the abort,
// the byte ranges, the whole export, the stand-in, and a description that reads no bytes. The
// fixture's `world` moves the material behind the ports and counts the port calls; the suite
// builds no service itself.
import assert from 'node:assert/strict'
import type { CapabilityId } from '@omne-harness/assets'
import type { Outcome } from '@omne-harness/operation-result'
import { computeDigest } from './digest.ts'
import type { ReadFailure } from './failures.ts'
import { PAGE_LIMIT } from './page-limit.ts'
import type { ReadResult, ReadTarget, SkillAccess } from './services.ts'
import { conformanceCase, handle, type ConformanceCase } from './testing-case.ts'
import type { PrincipalSample } from './testing-resolution.ts'
import type { PackagePath, SkillMaterialBasis } from './values.ts'

/** How many times each port was called since the fixture was made. */
export type PortCalls = Readonly<{ check: number; resolve: number; snapshot: number; open: number }>

/** A fresh service for one case, the principals and identities it asks about, and the world. */
export type AccessFixture<P, S> = Readonly<{
  access: SkillAccess<P, S>
  principals: Readonly<{
    /** A principal who may read `adopted`. */
    reader: PrincipalSample<P, S>
    /** A principal who has no right to any identity of the fixture. */
    stranger: PrincipalSample<P, S>
  }>
  capability: Readonly<{
    /**
     * An identity adopted for `reader`, with a readable package. For A10 the package has a text
     * resource that holds a character outside ASCII; without one, A10 is not applicable.
     */
    adopted: CapabilityId
    /** An identity that exists for nobody. */
    missing: CapabilityId
    /** An identity that the read check grants to `reader` and the resolution does not know. */
    checkedOnly: CapabilityId
    /** An identity that `reader` knows lawfully and that is not available now. */
    standIn?: CapabilityId
    /** An identity adopted for `reader` whose asset body has no `package.digest`. */
    noPackage?: CapabilityId
    /** An identity adopted for `reader` whose body is longer than one page (65536 bytes). */
    large?: CapabilityId
  }>
  /** Changes to the world behind the ports, and a view of it. Each change holds for the calls
   * that follow it. */
  world: Readonly<{
    /** The source now holds other content for `adopted`; the resolution still names the old digest. */
    replaceAdopted(): void
    /** The bytes of one resource of `adopted` now differ from what its snapshot lists. */
    changeEntry(): PackagePath
    /** The source now throws at `open`. */
    breakOpen(): void
    /** A signal that is aborted right after the source answers the next `snapshot`. */
    abortAfterSnapshot(): AbortSignal
    /** How many times each port was called since the fixture was made. */
    calls(): PortCalls
  }>
}>

const NOT_AVAILABLE = { failure: { kind: 'not-available-to-you' } }
const NO_CALLS: PortCalls = { check: 0, resolve: 0, snapshot: 0, open: 0 }

function body(capability: CapabilityId): ReadTarget {
  return { capability, part: { kind: 'body' } }
}

function resource(capability: CapabilityId, path: string): ReadTarget {
  return { capability, part: { kind: 'resource', path } }
}

function ok<T, F>(outcome: Outcome<T, F>, what: string): T {
  if (!('ok' in outcome)) assert.fail(`${what} failed: ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

async function describedBasis<P, S>(f: AccessFixture<P, S>): Promise<SkillMaterialBasis> {
  const { reader } = f.principals
  const description = ok(
    await f.access.describe(reader.access, reader.scope, f.capability.adopted),
    'describe of the adopted identity',
  )
  if (description.material.kind !== 'pinned')
    assert.fail('the adopted identity has no readable package')
  return description.material.basis
}

/** The text of one text resource of `adopted`, read page by page by the actual ranges. */
async function readAll<P, S>(f: AccessFixture<P, S>, path: PackagePath): Promise<string> {
  const { reader } = f.principals
  const pages: string[] = []
  for (let start = 0; ;) {
    const page = ok(
      await f.access.read(reader.access, reader.scope, resource(f.capability.adopted, path), {
        range: { start, length: PAGE_LIMIT },
      }),
      `read ${path} at ${start}`,
    )
    if (page.content.kind !== 'text') assert.fail(`${path} is not a text resource`)
    pages.push(page.content.text)
    if (page.complete) return pages.join('')
    start = page.range.start + page.range.length
  }
}

type TextSample = Readonly<{ path: PackagePath; text: string; bytes: Uint8Array }>

/** The text resources of `adopted`, read whole. */
async function textResources<P, S>(f: AccessFixture<P, S>): Promise<TextSample[]> {
  const { reader } = f.principals
  const listing = ok(
    await f.access.list(reader.access, reader.scope, f.capability.adopted),
    'list of the adopted identity',
  )
  const samples: TextSample[] = []
  for (const entry of listing.resources)
    if (entry.encoding === 'text') {
      const text = await readAll(f, entry.path)
      samples.push({ path: entry.path, text, bytes: new TextEncoder().encode(text) })
    }
  return samples
}

/** The index of the first lead byte of a character of several bytes, or `undefined`. */
function leadByteAt(bytes: Uint8Array): number | undefined {
  const index = bytes.findIndex(byte => byte >= 0xc0)
  return index === -1 ? undefined : index
}

function charLengthAt(bytes: Uint8Array, lead: number): number {
  let end = lead + 1
  while (end < bytes.length && (bytes[end] ?? 0) >> 6 === 0b10) end += 1
  return end - lead
}

function assertNoContent(outcome: Outcome<unknown, ReadFailure>, kind: ReadFailure['kind']) {
  assert.deepStrictEqual(outcome, { failure: { kind } })
}

export function skillAccessConformance<P, S>(): ConformanceCase<AccessFixture<P, S>>[] {
  return [
    conformanceCase(
      'A1',
      'answers a stranger the same for an adopted and a missing identity',
      async f => {
        const { stranger } = f.principals
        const { adopted, missing } = f.capability
        const ask = f.access
        const existing = await ask.describe(stranger.access, stranger.scope, adopted)
        assert.deepStrictEqual(existing, NOT_AVAILABLE)
        assert.deepStrictEqual(
          await ask.describe(stranger.access, stranger.scope, missing),
          existing,
        )
        const read = await ask.read(stranger.access, stranger.scope, body(adopted))
        assert.deepStrictEqual(read, NOT_AVAILABLE)
        assert.deepStrictEqual(await ask.read(stranger.access, stranger.scope, body(missing)), read)
        assert.deepStrictEqual(
          await ask.list(stranger.access, stranger.scope, adopted),
          await ask.list(stranger.access, stranger.scope, missing),
        )
      },
    ),
    conformanceCase(
      'A2',
      'answers a basis of another identity the same as a refused read',
      async f => {
        const { reader, stranger } = f.principals
        const basis = { ...(await describedBasis(f)), capability: f.capability.missing }
        const refused = await f.access.describe(
          stranger.access,
          stranger.scope,
          f.capability.adopted,
        )
        assert.deepStrictEqual(
          await f.access.describe(reader.access, reader.scope, f.capability.adopted, { basis }),
          refused,
        )
        assert.deepStrictEqual(
          await f.access.read(reader.access, reader.scope, body(f.capability.adopted), { basis }),
          refused,
        )
        assert.deepStrictEqual(
          await f.access.export(reader.access, reader.scope, f.capability.adopted, basis),
          refused,
        )
      },
    ),
    conformanceCase(
      'A3',
      'answers an identity that the resolution does not know the same as a refused read',
      async f => {
        const { reader, stranger } = f.principals
        const { checkedOnly } = f.capability
        const refused = await f.access.describe(
          stranger.access,
          stranger.scope,
          f.capability.adopted,
        )
        assert.deepStrictEqual(
          await f.access.describe(reader.access, reader.scope, checkedOnly),
          refused,
        )
        assert.deepStrictEqual(
          await f.access.read(reader.access, reader.scope, body(checkedOnly)),
          refused,
        )
      },
    ),
    conformanceCase(
      'A4',
      'answers basis-unavailable with a basis of material that the source no longer holds',
      async f => {
        const { reader } = f.principals
        const basis = await describedBasis(f)
        f.world.replaceAdopted()
        assertNoContent(
          await f.access.read(reader.access, reader.scope, body(f.capability.adopted), { basis }),
          'basis-unavailable',
        )
        assert.deepStrictEqual(
          await f.access.list(reader.access, reader.scope, f.capability.adopted, { basis }),
          { failure: { kind: 'basis-unavailable' } },
        )
        assert.deepStrictEqual(
          await f.access.export(reader.access, reader.scope, f.capability.adopted, basis),
          { failure: { kind: 'basis-unavailable' } },
        )
      },
    ),
    conformanceCase(
      'A5',
      'answers adopted-material-changed without a basis when the adopted material moved',
      async f => {
        const { reader } = f.principals
        f.world.replaceAdopted()
        assertNoContent(
          await f.access.read(reader.access, reader.scope, body(f.capability.adopted)),
          'adopted-material-changed',
        )
        assert.deepStrictEqual(
          await f.access.list(reader.access, reader.scope, f.capability.adopted),
          { failure: { kind: 'adopted-material-changed' } },
        )
      },
    ),
    conformanceCase(
      'A6',
      'answers version-changed without content when the bytes of an entry moved',
      async f => {
        const { reader } = f.principals
        const path = f.world.changeEntry()
        assertNoContent(
          await f.access.read(reader.access, reader.scope, resource(f.capability.adopted, path)),
          'version-changed',
        )
      },
    ),
    conformanceCase(
      'A7',
      'answers aborted without content and calls no port after the abort',
      async f => {
        const { reader } = f.principals
        const { adopted } = f.capability
        const already = AbortSignal.abort()
        assertNoContent(
          await f.access.read(reader.access, reader.scope, body(adopted), { signal: already }),
          'aborted',
        )
        assert.deepStrictEqual(
          await f.access.list(reader.access, reader.scope, adopted, { signal: already }),
          { failure: { kind: 'aborted' } },
        )
        assert.deepStrictEqual(f.world.calls(), NO_CALLS, 'a port was called after the abort')
        const basis = await describedBasis(f)
        const before = f.world.calls()
        assert.deepStrictEqual(
          await f.access.export(reader.access, reader.scope, adopted, basis, { signal: already }),
          { failure: { kind: 'aborted' } },
        )
        assert.deepStrictEqual(f.world.calls(), before, 'export called a port after the abort')
        const signal = f.world.abortAfterSnapshot()
        assertNoContent(
          await f.access.read(reader.access, reader.scope, body(adopted), { signal }),
          'aborted',
        )
        assert.equal(f.world.calls().open, before.open, 'open was called after the abort')
      },
    ),
    conformanceCase(
      'A8',
      'answers unsupported no-readable-package for read and list without a package',
      async f => {
        const noPackage = handle(f.capability.noPackage, 'noPackage')
        const { reader } = f.principals
        const description = ok(
          await f.access.describe(reader.access, reader.scope, noPackage),
          'describe without a package',
        )
        assert.deepStrictEqual(description.material, { kind: 'no-readable-package' })
        const unsupported = { failure: { kind: 'unsupported', what: 'no-readable-package' } }
        assert.deepStrictEqual(
          await f.access.read(reader.access, reader.scope, body(noPackage)),
          unsupported,
        )
        assert.deepStrictEqual(
          await f.access.list(reader.access, reader.scope, noPackage),
          unsupported,
        )
      },
    ),
    conformanceCase(
      'A9',
      'gives at most 65536 bytes per page and throws a TypeError for a bad range',
      async f => {
        const { reader } = f.principals
        for (const range of [
          { start: -1, length: 1 },
          { start: 0, length: -1 },
          { start: 0.5, length: 1 },
        ])
          await assert.rejects(
            f.access.read(reader.access, reader.scope, body(f.capability.adopted), { range }),
            TypeError,
          )
        const large = handle(f.capability.large, 'large')
        const page = ok(
          await f.access.read(reader.access, reader.scope, body(large), {
            range: { start: 0, length: PAGE_LIMIT * 2 },
          }),
          'read of the long body',
        )
        assert.ok(page.total > PAGE_LIMIT, 'the body of `large` is not longer than one page')
        assert.equal(page.range.length, PAGE_LIMIT)
        assert.equal(page.complete, false)
        const whole = ok(
          await f.access.read(reader.access, reader.scope, body(large)),
          'read of the long body without a range',
        )
        assert.deepStrictEqual(whole.range, page.range)
      },
    ),
    conformanceCase('A10', 'moves the range to the character boundaries of text', async f => {
      const { reader } = f.principals
      const sample = (await textResources(f)).find(item => leadByteAt(item.bytes) !== undefined)
      const { path, bytes } = handle(sample, 'a text resource with a character outside ASCII')
      const lead = leadByteAt(bytes) ?? 0
      const width = charLengthAt(bytes, lead)
      const target = resource(f.capability.adopted, path)
      const read = (range: ReadResult['range']) =>
        f.access.read(reader.access, reader.scope, target, { range })
      const inside = ok(await read({ start: lead + 1, length: 8 }), 'read inside a character')
      assert.equal(inside.range.start, lead + width, 'the start did not move to the next boundary')
      const short = ok(await read({ start: lead, length: width - 1 }), 'read of a short range')
      assert.deepStrictEqual(short.range, { start: lead, length: 0 })
      assert.deepStrictEqual(short.content, { kind: 'text', text: '' })
      assert.equal(short.complete, false)
      const whole = ok(await read({ start: lead, length: width }), 'read of one character')
      assert.deepStrictEqual(whole.range, { start: lead, length: width })
      assert.equal(
        whole.content.kind === 'text' ? whole.content.text : undefined,
        new TextDecoder().decode(bytes.subarray(lead, lead + width)),
      )
    }),
    conformanceCase('A11', 'pages through a resource by the actual ranges to complete', async f => {
      const { reader } = f.principals
      const [sample] = await textResources(f)
      const { path, text, bytes } = handle(sample, 'a text resource')
      const target = resource(f.capability.adopted, path)
      const pages: string[] = []
      let total = -1
      for (let start = 0, length = 3; ;) {
        const page = ok(
          await f.access.read(reader.access, reader.scope, target, { range: { start, length } }),
          `read at ${start}`,
        )
        if (page.content.kind !== 'text') assert.fail('a text resource gave bytes')
        assert.equal(page.total, bytes.length)
        assert.ok(page.range.start >= start, 'the start moved back')
        assert.equal(page.complete, page.range.start + page.range.length >= page.total)
        pages.push(page.content.text)
        total = page.total
        if (page.complete) break
        start = page.range.start + page.range.length
        length = page.range.length === 0 ? 4 : 3
      }
      assert.equal(pages.join(''), text)
      const past = ok(
        await f.access.read(reader.access, reader.scope, target, {
          range: { start: total + 1, length: 1 },
        }),
        'read past the total',
      )
      assert.deepStrictEqual(past.range, { start: total, length: 0 })
      assert.equal(past.complete, true)
    }),
    conformanceCase('A12a', 'exports every entry of the pinned snapshot, each checked', async f => {
      const { reader } = f.principals
      const basis = await describedBasis(f)
      const listing = ok(
        await f.access.list(reader.access, reader.scope, f.capability.adopted),
        'list',
      )
      const exported = ok(
        await f.access.export(reader.access, reader.scope, f.capability.adopted, basis),
        'export',
      )
      assert.deepStrictEqual(exported.basis, basis)
      assert.equal(exported.digest, basis.digest)
      const paths = new Set<string>(exported.entries.map(entry => entry.path))
      for (const entry of listing.resources)
        assert.ok(paths.has(entry.path), `${entry.path} missing`)
      assert.ok(paths.has('SKILL.md'), 'the control file SKILL.md is missing')
      for (const entry of exported.entries) {
        assert.equal(computeDigest(entry.bytes), entry.digest, `${entry.path}: digest`)
        assert.equal(entry.bytes.length, entry.size, `${entry.path}: size`)
      }
    }),
    conformanceCase(
      'A12b',
      'answers version-changed without entries when one entry moved after the snapshot',
      async f => {
        const { reader } = f.principals
        const basis = await describedBasis(f)
        f.world.changeEntry()
        assert.deepStrictEqual(
          await f.access.export(reader.access, reader.scope, f.capability.adopted, basis),
          { failure: { kind: 'version-changed' } },
        )
      },
    ),
    conformanceCase(
      'A13',
      'describes without reading bytes: the source may throw at open',
      async f => {
        const { reader } = f.principals
        f.world.breakOpen()
        const before = f.world.calls()
        const description = ok(
          await f.access.describe(reader.access, reader.scope, f.capability.adopted),
          'describe with a broken open',
        )
        assert.equal(description.material.kind, 'pinned')
        assert.equal(description.addressing, 'package-relative-path')
        const after = f.world.calls()
        assert.equal(after.snapshot, before.snapshot, 'describe took a snapshot')
        assert.equal(after.open, before.open, 'describe opened an entry')
      },
    ),
    conformanceCase(
      'A14',
      'answers unavailable-stand-in with a safe reason for a lawfully known, unavailable identity',
      async f => {
        const standIn = handle(f.capability.standIn, 'standIn')
        const { reader } = f.principals
        const described = await f.access.describe(reader.access, reader.scope, standIn)
        if ('ok' in described) assert.fail('describe of the stand-in succeeded')
        const { failure } = described
        if (failure.kind !== 'unavailable-stand-in')
          assert.fail(`expected a stand-in, got ${failure.kind}`)
        assert.deepStrictEqual(failure.standIn.capability, standIn)
        assert.ok(failure.standIn.reason.length > 0, 'the stand-in has no reason')
        assert.deepStrictEqual(
          await f.access.read(reader.access, reader.scope, body(standIn)),
          described,
        )
        assert.deepStrictEqual(await f.access.list(reader.access, reader.scope, standIn), described)
      },
    ),
  ]
}
