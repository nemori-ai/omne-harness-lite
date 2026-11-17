import { describe, expect, it } from 'vitest'
import { capabilityId } from '@omne-harness/assets'
import { createSkillAccess, createSkillCatalog } from '@omne-harness/skill'
import { isAssetVersion, isSkillName } from '@omne-harness/skill-contract'
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
  it('is read and listed in the catalog', async () => {
    const description = 'd'.repeat(1077)
    const source = sourceOf(description)
    const snapshot = okOf(await source.snapshot(locator))
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
                digest: snapshot.digest,
              },
              declared: { name: granted(isSkillName, 'claude-api'), description, tools: [] },
            },
          },
        },
      ]),
    }
    const access = createSkillAccess(ports)
    const page = okOf(
      await access.read(alice, scope, { capability: id.id, part: { kind: 'body' } }),
    )
    expect(page.content).toStrictEqual({ kind: 'text', text: BODY })
    expect(page.basis.digest).toBe(snapshot.digest)
    const listed = okOf(await createSkillCatalog(ports).summaries(alice, scope))
    expect(listed).toMatchObject([{ kind: 'adopted', description }])
  })
})
