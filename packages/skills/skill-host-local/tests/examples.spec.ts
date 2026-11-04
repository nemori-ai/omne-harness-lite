// The real-directory example of `examples/directory-journey.ts` runs as a test: a temporary
// directory holds two legal packages and one illegal package; the journey inspects every
// package through the directory source, builds the catalog and the access over the read check
// and resolution that this test gives it, lists the summaries, searches by the description,
// describes the Skill it found and reads the first page of its body. The read check and the
// resolution are the memory doubles of `skill-contract/testing`; the capability identities and
// the reader are built by the real constructors of `@omne-harness/assets` and
// `@omne-harness/legal-identity`. Nothing here is a product assembly.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  isSkillName,
  sameCapability,
  type CatalogEntry,
  type SkillName,
} from '@omne-harness/skill-contract'
import type { SkillResolution, SkillRef } from '@omne-harness/skill-contract/provider'
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
const REVIEW_MANIFEST = `---\nname: review\ndescription: Reviews a change and writes findings.\n---\n${BODY}`

const PACKAGES = {
  review: {
    'SKILL.md': REVIEW_MANIFEST,
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

function identity(name: string): CapabilityId {
  const id = capabilityId('skill', name)
  if (!id.ok) throw new Error(`not a capability identity: skill:${name}`)
  return id.id
}

function skillName(text: string): SkillName {
  if (!isSkillName(text)) throw new Error(`not a skill name: ${text}`)
  return text
}

const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('the test tenant texts are not legal')

const reader: Reader<Principal, Scope> = {
  access: access('reader', tenant(organization.value, account.value)),
  scope: 'example',
}

/** What a resolution holds for an adopted package of a workspace source: its reference and projection. */
function adoptedOf(item: InspectedPackage) {
  const capability = identity(item.definition.manifest.name)
  const ref: SkillRef = {
    capability,
    layer: 'workspace',
    locator: { kind: 'directory', root: item.root },
    digest: item.definition.snapshot.digest,
  }
  return { capability, ref, declared: declaredOf(item.definition) }
}

/**
 * The read check refuses `deploy` and grants every other identity; the resolution adopts every
 * legal package for everyone. A package that inspection rejected would be granted if it reached
 * the stand-ins at all, so its absence from the summaries shows that it did not.
 */
const standIns: StandIns<Principal, Scope> = packages => {
  const adopted = packages.map(adoptedOf)
  return {
    readCheck: createMemoryReadCheck(
      adopted.map(item => ({
        capability: item.capability,
        visible: () => item.declared.name !== 'deploy',
      })),
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

/** The stand-ins above, with a resolution that runs `before` each time it resolves `review`. */
function resolvingWith(before: (call: number) => Promise<void>): StandIns<Principal, Scope> {
  return packages => {
    const ports = standIns(packages)
    let calls = 0
    const resolution: SkillResolution<Principal, Scope> = {
      ...ports.resolution,
      async resolve(who, at, capability, options) {
        if (sameCapability(capability, identity('review'))) {
          calls += 1
          await before(calls)
        }
        return ports.resolution.resolve(who, at, capability, options)
      },
    }
    return { ...ports, resolution }
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

    const listed: CatalogEntry[] = [
      {
        kind: 'adopted',
        capability: identity('review'),
        name: skillName('review'),
        description: 'Reviews a change and writes findings.',
        dependencies: [],
      },
    ]
    expect(journey.summaries).toStrictEqual({ ok: listed })
    expect(journey.search).toStrictEqual(journey.summaries)

    expect(journey.firstPage).toMatchObject({
      ok: { part: { kind: 'body' }, content: { kind: 'text', text: BODY }, complete: true },
    })
  })

  it('reads on the material that describe pinned', async () => {
    const journey = await runDirectoryJourney(await root(), { reader, standIns, query: 'findings' })
    const described = journey.described
    if (described === undefined || !('ok' in described)) throw new Error('describe failed')
    const { material } = described.ok
    if (material.kind !== 'pinned') throw new Error('describe pinned no material')
    expect(journey.firstPage).toMatchObject({ ok: { basis: material.basis } })
  })

  it('answers basis-unavailable when the package changes between describe and read', async () => {
    const base = await root()
    const changeBeforeRead = async (call: number) => {
      if (call === 2)
        await writeFile(join(base, 'review', 'SKILL.md'), REVIEW_MANIFEST.replace('diff', 'patch'))
    }
    const journey = await runDirectoryJourney(base, {
      reader,
      standIns: resolvingWith(changeBeforeRead),
      query: 'findings',
    })
    expect(journey.described).toHaveProperty('ok')
    expect(journey.firstPage).toStrictEqual({ failure: { kind: 'basis-unavailable' } })
  })

  it('finds nothing for a description that only a refused package has, and reads no page then', async () => {
    const journey = await runDirectoryJourney(await root(), {
      reader,
      standIns,
      query: 'release',
    })
    expect(journey.search).toStrictEqual({ ok: [] })
    expect(journey.described).toBeUndefined()
    expect(journey.firstPage).toBeUndefined()
  })
})
