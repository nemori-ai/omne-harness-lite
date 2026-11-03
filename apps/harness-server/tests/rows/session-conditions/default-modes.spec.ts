// The `session-conditions` row: the tenant-default modes resolver over the definition mapping. A
// session's creation names the modes adoption of its entry; the resolver gives the entry's modes
// only while the entry still stands for exactly that adoption. A missing entry or a changed default
// is `unavailable`, never the current default. The row declaration matches the stubs table.
import type { Modes } from '@omne-harness/session-contract'
import {
  modesAdoptionOf,
  type DefinitionMappingEntry,
  type DefinitionMappings,
} from '@omne-harness/server-entry/cordis'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import { describe, expect, test } from 'vitest'
import { defaultModesOf, sessionConditionsRow } from '../../../src/rows/session-conditions/index.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import { serveProfile } from '../../../src/profile.ts'

const adoption = (name: string) => ({ owner: 'test', name, revision: '1', digest: `d:${name}` })

const modes: Modes = {
  permission: 'never',
  environment: adoption('environment'),
  collaboration: 'auto-drive',
}

const coding: DefinitionMappingEntry = {
  name: 'coding',
  candidate: adoption('coding@2'),
  execution: adoption('execution'),
  entryContract: adoption('entry'),
  requiredIdentities: [],
  modes,
}

function tableOf(entries: readonly DefinitionMappingEntry[]): DefinitionMappings {
  return {
    identity: 'table',
    entries: () => entries,
    byName: name => entries.find(entry => entry.name === name),
    byCandidate: candidate =>
      entries.find(entry => JSON.stringify(entry.candidate) === JSON.stringify(candidate)),
  }
}

const tenant = memoryAccess('tester').tenant

const ask = (table: DefinitionMappings, source = modesAdoptionOf(coding), name = 'coding') =>
  defaultModesOf(table)({
    tenant,
    session: 'session-1' as never,
    definition: { name, adopted: coding.candidate },
    source,
  })

describe('the tenant-default modes of a session', () => {
  test('the entry that still stands for the named source gives its modes, with the adoption as basis', async () => {
    const answer = await ask(tableOf([coding]))
    const current = modesAdoptionOf(coding)
    expect(answer).toEqual({
      ok: {
        modes,
        basis: {
          owner: current.owner,
          record: current.name,
          revision: current.revision,
          digest: current.digest,
        },
      },
    })
  })

  test('a definition name with no entry is unavailable', async () => {
    expect(await ask(tableOf([coding]), modesAdoptionOf(coding), 'assistant')).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  test('a default that changed since the creation is unavailable, not the current default', async () => {
    const changed: DefinitionMappingEntry = {
      ...coding,
      modes: { ...modes, collaboration: 'co-work' },
    }
    expect(await ask(tableOf([changed]), modesAdoptionOf(coding))).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })
})

describe('the row declaration', () => {
  test('provides agentConditions and injects the four keys of the stubs table', () => {
    const declaration = rowDeclarationOf(sessionConditionsRow)
    expect(declaration?.implementation).toBe('real')
    const table = serveProfile().stubManifests.get('session-conditions' as never)
    expect([...(declaration?.manifest.injects ?? [])].sort()).toEqual(
      [...(table?.injects ?? [])].sort(),
    )
    expect(declaration?.manifest.provides).toEqual(['agentConditions'])
  })
})
