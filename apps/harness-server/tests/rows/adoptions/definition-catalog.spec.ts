import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { agentAdoptionsConfig } from '../../../src/rows/agent-adoptions/config.ts'
import { agentDefinitionCatalogKey } from '../../../src/rows/agent-adoptions/definition-catalog.ts'
import { agentAdoptionsRow } from '../../../src/rows/agent-adoptions/index.ts'
import { fixtureTenant } from '../../entry/support.ts'
import { mappingConfig } from './support.ts'

function releaseConfig(): unknown {
  const distribution = JSON.parse(
    readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
  ) as { rows: readonly { id: string; config: unknown }[] }
  return distribution.rows.find(row => row.id === 'agent-adoptions')?.config
}

async function catalogOf(config: unknown) {
  const ctx = new Context()
  await ctx.plugin(agentAdoptionsRow, agentAdoptionsConfig.parse(config))
  const catalog = ctx.get(agentDefinitionCatalogKey)
  if (catalog === undefined) throw new Error('the row does not provide the catalog')
  return catalog
}

it('lists the definitions of the release to a tenant, each with its name, type and summary', async () => {
  const catalog = await catalogOf(releaseConfig())
  expect(catalog.visibleTo(fixtureTenant('a'))).toEqual([
    {
      name: 'assistant',
      type: 'non-master',
      summary: expect.stringMatching(/^A general assistant without tools\./u),
    },
    {
      name: 'coding',
      type: 'master',
      summary: expect.stringMatching(/^A coding agent with the full tool set/u),
    },
  ])
})

it('gives each entry nothing but the three members, frozen, in the order of the table', async () => {
  const catalog = await catalogOf(mappingConfig())
  const listed = catalog.visibleTo(fixtureTenant('b'))
  expect(listed.length).toBeGreaterThan(0)
  for (const entry of listed) {
    expect(Object.keys(entry).sort()).toEqual(['name', 'summary', 'type'])
    expect(Object.isFrozen(entry)).toBe(true)
  }
  expect(listed.map(entry => entry.name)).toEqual(
    (mappingConfig() as { mappings: readonly { name: string }[] }).mappings.map(item => item.name),
  )
})
