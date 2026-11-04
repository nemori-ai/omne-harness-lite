// The conformance suite of `SkillCatalog`. It takes a catalog over doubles that the implementer
// built, and checks from the outside what the group page "检查与发现" and the SPEC "目录的匹配规则"
// require: the lawful set and nothing else, the read check before every entry, one unknown makes
// the whole answer unknown, the entry shapes, the `capabilities` filter, the `search` matching,
// and non-disclosure. The fixture's `world` changes the ports and counts the read checks; the
// suite builds no catalog itself. Clause `SCn` names the decided item n of the W3 Skill spec.
import assert from 'node:assert/strict'
import type { CapabilityId } from '@omne-harness/assets'
import type { Outcome } from '@omne-harness/operation-result'
import { sameCapability } from './capability.ts'
import type { CatalogEntry, SkillCatalog } from './services.ts'
import { conformanceCase, type ConformanceCase } from './testing-case.ts'
import type { PrincipalSample } from './testing-resolution.ts'

type AdoptedEntry = Extract<CatalogEntry, { kind: 'adopted' }>
type StandInEntry = Extract<CatalogEntry, { kind: 'stand-in' }>

/** A fresh catalog for one case, the principals and identities it asks about, and the world. */
export type CatalogFixture<P, S> = Readonly<{
  catalog: SkillCatalog<P, S>
  /** A principal whose lawful set holds exactly `granted`, `refused` and `standIn`. */
  reader: PrincipalSample<P, S>
  /** A principal whose lawful set is empty. */
  nobody: PrincipalSample<P, S>
  /** An identity adopted for `reader` that `reader` may read, written as the entry the catalog
   * must give for it. `dependencies` are the tools of its declaration projection. */
  granted: AdoptedEntry
  /** An identity in the lawful set of `reader` that the read check refuses to `reader`. */
  refused: CapabilityId
  /**
   * An identity known lawfully by `reader`, not available now, that `reader` may read, written as
   * the entry the catalog must give for it. Its name and description do not contain
   * `granted.name`, so that a search for `granted.name` does not reach it.
   */
  standIn: StandInEntry
  /** An identity that exists for nobody. */
  missing: CapabilityId
  /** Changes to the world behind the ports, and a view of it. Each change holds for the calls
   * that follow it. */
  world: Readonly<{
    /** The lawful set of every principal now answers `unknown`. */
    lawfulSetUnknown(): void
    /** The read check now answers `unknown` for `capability`, for every principal. */
    verdictUnknown(capability: CapabilityId): void
    /** The lawful set of `reader` now lists `granted` twice. */
    repeatGranted(): void
    /** `refused` now exists for nobody: it leaves the lawful set of `reader`. */
    removeRefused(): void
    /** How many times the read check was called since the fixture was made. */
    checks(): number
  }>
}>

type Entries = readonly CatalogEntry[]

function ok<T>(outcome: Outcome<T, 'unknown'>, what: string): T {
  if (!('ok' in outcome)) assert.fail(`${what} answered unknown`)
  return outcome.ok
}

function unknown<T>(outcome: Outcome<T, 'unknown'>, what: string): void {
  assert.ok(!('ok' in outcome), `${what} answered ok instead of unknown`)
  assert.equal(outcome.failure, 'unknown')
}

function entryOf(entries: Entries, capability: CapabilityId): CatalogEntry | undefined {
  return entries.find(entry => sameCapability(entry.capability, capability))
}

function lists(entries: Entries, capability: CapabilityId): boolean {
  return entryOf(entries, capability) !== undefined
}

function summariesOf<P, S>(
  f: CatalogFixture<P, S>,
  who: PrincipalSample<P, S>,
  capabilities?: readonly CapabilityId[],
): Promise<Outcome<Entries, 'unknown'>> {
  return f.catalog.summaries(who.access, who.scope, capabilities)
}

function searchOf<P, S>(
  f: CatalogFixture<P, S>,
  who: PrincipalSample<P, S>,
  text: string,
): Promise<Outcome<Entries, 'unknown'>> {
  return f.catalog.search(who.access, who.scope, { text })
}

/** The text with each ASCII letter written in its fullwidth form; NFKC folds it back. */
function fullwidth(text: string): string {
  return [...text]
    .map(char => {
      const code = char.codePointAt(0) ?? 0
      const letter = (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
      return letter ? String.fromCodePoint(code - 0x21 + 0xff01) : char
    })
    .join('')
}

/** The names of the two non-disclosure cases. */
export const CATALOG_NO_DISCLOSURE_LISTING =
  'answers the same whether a refused identity is in the lawful set or does not exist'
export const CATALOG_NO_DISCLOSURE_FILTER =
  'answers a filter naming a refused identity the same as one naming a missing identity'

export function skillCatalogConformance<P, S>(): ConformanceCase<CatalogFixture<P, S>>[] {
  return [
    conformanceCase('SC2', 'answers an empty list for an empty lawful set', async f => {
      assert.deepStrictEqual(ok(await summariesOf(f, f.nobody), 'summaries'), [])
      assert.deepStrictEqual(ok(await searchOf(f, f.nobody, ''), 'search'), [])
    }),
    conformanceCase('SC2', 'answers unknown when the lawful set is unknown', async f => {
      f.world.lawfulSetUnknown()
      unknown(await summariesOf(f, f.reader), 'summaries')
      unknown(await searchOf(f, f.reader, ''), 'search')
      unknown(await summariesOf(f, f.reader, [f.granted.capability]), 'summaries with a filter')
    }),
    conformanceCase('SC3', 'lists a granted identity and not a refused one', async f => {
      const entries = ok(await summariesOf(f, f.reader), 'summaries')
      assert.ok(lists(entries, f.granted.capability), 'the granted identity is missing')
      assert.ok(!lists(entries, f.refused), 'the refused identity is listed')
    }),
    conformanceCase(
      'SC3',
      'answers unknown when the read check of one identity is unknown',
      async f => {
        f.world.verdictUnknown(f.standIn.capability)
        unknown(await summariesOf(f, f.reader), 'summaries')
        unknown(await searchOf(f, f.reader, ''), 'search')
      },
    ),
    conformanceCase(
      'SC3',
      'checks an identity listed twice in the lawful set once and lists it once',
      async f => {
        f.world.repeatGranted()
        const before = f.world.checks()
        const entries = ok(await summariesOf(f, f.reader, [f.granted.capability]), 'summaries')
        assert.equal(f.world.checks() - before, 1, 'the read check was not called exactly once')
        assert.deepStrictEqual(entries, [f.granted])
      },
    ),
    conformanceCase('SC4', 'gives an adopted entry with its dependencies', async f => {
      const entries = ok(await summariesOf(f, f.reader), 'summaries')
      assert.deepStrictEqual(entryOf(entries, f.granted.capability), f.granted)
    }),
    conformanceCase('SC4', 'gives a stand-in entry with its reason', async f => {
      const entries = ok(await summariesOf(f, f.reader), 'summaries')
      assert.deepStrictEqual(entryOf(entries, f.standIn.capability), f.standIn)
    }),
    conformanceCase('SC4', 'answers the same list for the same input', async f => {
      const first = ok(await summariesOf(f, f.reader), 'summaries')
      const second = ok(await summariesOf(f, f.reader), 'summaries')
      assert.deepStrictEqual(second, first)
    }),
    conformanceCase(
      'SC5',
      'filters to the identities of the request that are lawful and granted',
      async f => {
        const entries = ok(
          await summariesOf(f, f.reader, [f.granted.capability, f.refused, f.missing]),
          'summaries',
        )
        assert.deepStrictEqual(entries, [f.granted])
      },
    ),
    conformanceCase('SC5', 'lists an identity named twice in the request once', async f => {
      const entries = ok(
        await summariesOf(f, f.reader, [f.granted.capability, f.granted.capability]),
        'summaries',
      )
      assert.deepStrictEqual(entries, [f.granted])
    }),
    conformanceCase(
      'SC5',
      'answers an empty list for an empty request without calling the read check',
      async f => {
        const before = f.world.checks()
        assert.deepStrictEqual(ok(await summariesOf(f, f.reader, []), 'summaries'), [])
        assert.equal(f.world.checks(), before, 'the read check was called')
      },
    ),
    conformanceCase('SC5', 'does not check an identity that the request leaves out', async f => {
      const before = f.world.checks()
      ok(await summariesOf(f, f.reader, [f.granted.capability]), 'summaries')
      assert.equal(f.world.checks() - before, 1, 'an identity outside the request was checked')
    }),
    conformanceCase('SC6', 'matches by name after NFKC and lower case', async f => {
      const expected = [f.granted]
      const upper = ok(await searchOf(f, f.reader, f.granted.name.toUpperCase()), 'search')
      assert.deepStrictEqual(upper, expected)
      const wide = ok(await searchOf(f, f.reader, fullwidth(f.granted.name)), 'search')
      assert.deepStrictEqual(wide, expected)
    }),
    conformanceCase('SC6', 'matches only when every word of the query matches', async f => {
      const words = `${f.granted.name} ${f.granted.name.toUpperCase()}`
      assert.deepStrictEqual(ok(await searchOf(f, f.reader, words), 'search'), [f.granted])
      const stray = `${f.granted.name} conformance-word-that-matches-nothing`
      assert.deepStrictEqual(ok(await searchOf(f, f.reader, stray), 'search'), [])
    }),
    conformanceCase('SC6', 'matches everything for a query without words', async f => {
      const all = ok(await summariesOf(f, f.reader), 'summaries')
      assert.deepStrictEqual(ok(await searchOf(f, f.reader, ''), 'search'), all)
      assert.deepStrictEqual(ok(await searchOf(f, f.reader, ' \t\n '), 'search'), all)
    }),
    conformanceCase('SC6', 'does not check an identity that the query does not match', async f => {
      const before = f.world.checks()
      ok(await searchOf(f, f.reader, f.granted.name), 'search')
      assert.equal(f.world.checks() - before, 1, 'an identity the query misses was checked')
    }),
    conformanceCase('SC7', CATALOG_NO_DISCLOSURE_LISTING, async f => {
      const withRefused = {
        summaries: await summariesOf(f, f.reader),
        all: await searchOf(f, f.reader, ''),
        byName: await searchOf(f, f.reader, f.refused.name),
      }
      f.world.removeRefused()
      assert.deepStrictEqual(await summariesOf(f, f.reader), withRefused.summaries)
      assert.deepStrictEqual(await searchOf(f, f.reader, ''), withRefused.all)
      assert.deepStrictEqual(await searchOf(f, f.reader, f.refused.name), withRefused.byName)
    }),
    conformanceCase('SC7', CATALOG_NO_DISCLOSURE_FILTER, async f => {
      assert.deepStrictEqual(
        await summariesOf(f, f.reader, [f.granted.capability, f.refused]),
        await summariesOf(f, f.reader, [f.granted.capability, f.missing]),
      )
      assert.deepStrictEqual(
        await summariesOf(f, f.reader, [f.refused]),
        await summariesOf(f, f.reader, [f.missing]),
      )
    }),
  ]
}
