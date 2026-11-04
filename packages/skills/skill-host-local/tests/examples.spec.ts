// The real-directory example of `examples/directory-journey.ts` runs as a test: a temporary
// directory holds two legal packages and one illegal package; the journey inspects every
// package through the directory source, builds the catalog and the access over the read check
// and resolution stand-ins that this test gives it, lists the summaries, searches by the
// description, and reads the first page of the body. The stand-ins are the memory doubles of
// `skill-contract/testing`; the tenant of the reader is a stand-in too, which the doubles never
// read. Nothing here is a product assembly.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSkillName, type CatalogEntry } from '@omne-harness/skill-contract'
import type { SkillRef } from '@omne-harness/skill-contract/provider'
import { createMemoryReadCheck, createMemoryResolution } from '@omne-harness/skill-contract/testing'
import {
  declaredOf,
  runDirectoryJourney,
  type InspectedPackage,
  type Reader,
  type StandIns,
} from '../examples/directory-journey.ts'
import { scratch, writeTree } from './scratch.ts'

type Principal = 'reader'
type Scope = 'example'

const BODY = 'Read the diff.\n仔细看每一处改动。\n'

const PACKAGES = {
  review: {
    'SKILL.md': `---\nname: review\ndescription: Reviews a change and writes findings.\n---\n${BODY}`,
    '.omne/skill.json': '{"formatVersion":1}\n',
    'docs/guide.md': '# Guide\n',
  },
  deploy: {
    'SKILL.md': '---\nname: deploy\ndescription: Ships a release.\n---\nRun the pipeline.\n',
  },
  // The directory is `broken` and the manifest names `other`: `name-mismatch`.
  broken: {
    'SKILL.md': '---\nname: other\ndescription: Names another package.\n---\nNo.\n',
  },
}

/** The reader. The tenant is a stand-in: the memory doubles decide by principal and identity only. */
const reader: Reader<Principal, Scope> = {
  access: { principal: 'reader', tenant: 'example-tenant' } as unknown as Reader<
    Principal,
    Scope
  >['access'],
  scope: 'example',
}

/**
 * A capability identity of the `skill` category. Minting one is the asset side's job
 * (`@omne-harness/assets`), which this member does not depend on: the test mints a stand-in.
 */
type CapabilityId = CatalogEntry['capability']
const mint = (name: string): CapabilityId =>
  ({ category: 'skill', name }) as unknown as CapabilityId

/** What a resolution would hold for an adopted package of a workspace source: its reference and projection. */
function adoptedOf(item: InspectedPackage) {
  const capability = mint(item.definition.manifest.name)
  const ref: SkillRef = {
    capability,
    layer: 'workspace',
    locator: { kind: 'directory', root: item.root },
    digest: item.definition.snapshot.digest,
  }
  return { capability, ref, declared: declaredOf(item.definition) }
}

const REVIEW = 'review'
if (!isSkillName(REVIEW)) throw new Error('the sample name is not a skill name')

/** The read check grants `review` only; the resolution adopts every legal package for everyone. */
const standIns: StandIns<Principal, Scope> = packages => {
  const adopted = packages.map(adoptedOf)
  return {
    readCheck: createMemoryReadCheck(
      adopted
        .filter(item => item.declared.name === REVIEW)
        .map(item => ({ capability: item.capability, visible: () => true })),
    ),
    resolution: createMemoryResolution(
      adopted.map(item => ({
        capability: item.capability,
        visible: () => true,
        state: { kind: 'adopted', current: { ref: item.ref, declared: item.declared } },
      })),
    ),
  }
}

async function root(): Promise<string> {
  const base = await scratch()
  for (const [name, files] of Object.entries(PACKAGES)) await writeTree(join(base, name), { files })
  return base
}

describe('the directory journey', () => {
  it('inspects two legal packages and rejects one, lists the granted one, finds it by its description and reads its body', async () => {
    const journey = await runDirectoryJourney(await root(), {
      reader,
      standIns,
      query: 'findings',
    })

    expect(journey.inspected.map(item => item.name)).toStrictEqual(['broken', 'deploy', 'review'])
    expect(journey.inspected.map(item => 'ok' in item.outcome)).toStrictEqual([false, true, true])
    const broken = journey.inspected[0]?.outcome
    expect(broken).toMatchObject({ failure: { kind: 'rejected', code: 'name-mismatch' } })

    const listed: Partial<CatalogEntry>[] = [{ kind: 'adopted', name: REVIEW, dependencies: [] }]
    expect(journey.summaries).toMatchObject({ ok: listed })
    expect('ok' in journey.summaries && journey.summaries.ok.length).toBe(1)
    expect(journey.search).toStrictEqual(journey.summaries)

    expect(journey.firstPage).toMatchObject({
      ok: { part: { kind: 'body' }, content: { kind: 'text', text: BODY }, complete: true },
    })
  })

  it('finds nothing for a description that no granted package has, and reads no page then', async () => {
    const journey = await runDirectoryJourney(await root(), {
      reader,
      standIns,
      query: 'release',
    })
    expect(journey.search).toStrictEqual({ ok: [] })
    expect(journey.firstPage).toBeUndefined()
  })
})
