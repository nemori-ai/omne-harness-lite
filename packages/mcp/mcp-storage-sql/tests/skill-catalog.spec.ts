// @module-tag slow
// Opens a real SQLite storage with its worker threads for every case.
import { expect, it } from 'vitest'
import type {
  CatalogKey,
  CatalogRevision,
  EventCatalogRecord,
  SkillCatalogRecord,
} from '@omne-harness/mcp-contract'
import { endpointRefOf, jsonOf, sampleCatalogRecord } from '@omne-harness/mcp-contract/testing'
import { openSqlWorld, temporaryRoot, tenantOf } from './world.ts'

const key: CatalogKey = {
  tenant: tenantOf('s'),
  account: { kind: 'anonymous' },
  holding: endpointRefOf('desk').holding,
}
const basis = sampleCatalogRecord(1, []).basis
const freshness = { acquiredAt: '2026-11-28T04:00:00.000Z', changedNotified: false }
const skills = (revision: number): SkillCatalogRecord => ({
  revision: revision as CatalogRevision,
  basis,
  freshness,
  declared: true,
  skills: [
    {
      name: 'style',
      description: { untrusted: 'House style.' },
      uri: 'skill://docs/style/SKILL.md',
      frontmatter: jsonOf({ name: 'style', description: 'House style.', 'allowed-tools': 'Bash' }),
      files: [
        {
          uri: 'skill://docs/style/SKILL.md',
          path: 'SKILL.md',
          digest: `sha256:${'a'.repeat(64)}`,
          size: 42,
        },
      ],
    },
  ],
  refused: [{ name: 'live', uri: 'skill://docs/live/SKILL.md', reason: 'dynamic' }],
})
const events: EventCatalogRecord = {
  revision: 1 as CatalogRevision,
  basis,
  freshness,
  declared: false,
  types: [],
}

it('C403 the skills of a peer are kept beside its actions and event types under the same key, by revision, across a restart', async () => {
  const root = temporaryRoot()
  const first = await openSqlWorld(root)
  const actions = sampleCatalogRecord(1, ['read'])
  expect(await first.store.write(key, actions, 'absent')).toEqual({ ok: true })
  expect(await first.events.write(key, events, 'absent')).toEqual({ ok: true })
  expect(await first.skills.read(key)).toEqual({ ok: 'absent' })
  expect(await first.skills.write(key, skills(1), 'absent')).toEqual({ ok: true })
  expect(await first.skills.write(key, skills(2), 'absent')).toEqual({
    failure: 'revision-conflict',
  })
  await first.close()
  const second = await openSqlWorld(root)
  try {
    expect(await second.skills.read(key)).toEqual({ ok: skills(1) })
    expect(await second.events.read(key)).toEqual({ ok: events })
    expect(await second.store.read(key)).toEqual({ ok: actions })
    expect(await second.skills.read({ ...key, tenant: tenantOf('t') })).toEqual({ ok: 'absent' })
  } finally {
    await second.close()
  }
})
