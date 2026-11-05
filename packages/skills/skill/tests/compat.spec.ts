// A community Skill whose description is longer than the 1024 characters of the Agent Skills
// specification (for example `claude-api` with 1077) is usable, not only loadable: `inspect`
// accepts it with the hint `description-over-limit`, and through ports that carry the whole
// description `describe`, `read` of its body and the catalog all succeed. Over the contract's
// `DESCRIPTION_LIMIT` (16384) the package stays rejected.
import { describe, expect, it } from 'vitest'
import { capabilityId } from '@omne-harness/assets'
import { createPackageInspection, createSkillAccess, createSkillCatalog } from '@omne-harness/skill'
import { DESCRIPTION_LIMIT, isAssetVersion } from '@omne-harness/skill-contract'
import {
  createMemoryReadCheck,
  createMemoryResolution,
  createMemorySource,
} from '@omne-harness/skill-contract/testing'
import { alice, granted, okOf, scope } from './access-world.ts'

const locator = { kind: 'directory', root: '/skills/claude-api' } as const
const BODY = 'Use the API.\n'

function sourceOf(description: string) {
  return createMemorySource([
    {
      locator,
      rootName: 'claude-api',
      files: { 'SKILL.md': `---\nname: claude-api\ndescription: ${description}\n---\n${BODY}` },
    },
  ])
}

describe('a description longer than 1024 characters', () => {
  it('inspects with the hint and is described, read and listed in the catalog', async () => {
    const description = 'd'.repeat(1077)
    const source = sourceOf(description)
    const definition = okOf(await createPackageInspection(source).inspect(locator))
    expect(definition.compatibilityHints).toStrictEqual(['description-over-limit'])
    const id = capabilityId('skill', 'claude-api')
    if (!id.ok) throw new Error('skill:claude-api is no capability identity')
    const ports = {
      source,
      readCheck: createMemoryReadCheck([{ capability: id.id, visible: () => true }]),
      resolution: createMemoryResolution([
        {
          capability: id.id,
          visible: () => true,
          state: {
            kind: 'adopted',
            current: {
              ref: {
                capability: id.id,
                layer: 'tenant',
                assetVersion: granted(isAssetVersion, 'v1'),
                locator,
                digest: definition.snapshot.digest,
              },
              declared: {
                name: definition.manifest.name,
                description: definition.manifest.description,
                tools: [],
                scripts: [],
                settings: [],
              },
            },
          },
        },
      ]),
    }
    const access = createSkillAccess(ports)
    expect(okOf(await access.describe(alice, scope, id.id)).material.kind).toBe('pinned')
    const page = okOf(
      await access.read(alice, scope, { capability: id.id, part: { kind: 'body' } }),
    )
    expect(page.content).toStrictEqual({ kind: 'text', text: BODY })
    const listed = okOf(await createSkillCatalog(ports).summaries(alice, scope))
    expect(listed).toMatchObject([{ kind: 'adopted', description }])
  })

  it('is rejected over DESCRIPTION_LIMIT', async () => {
    const source = sourceOf('d'.repeat(DESCRIPTION_LIMIT + 1))
    expect(await createPackageInspection(source).inspect(locator)).toMatchObject({
      failure: { kind: 'rejected', code: 'malformed' },
    })
  })
})
