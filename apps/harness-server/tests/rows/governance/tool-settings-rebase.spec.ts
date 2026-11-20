import { beforeAll, expect, it } from 'vitest'
import type { SettingDefinitions, SettingsState } from '@omne-harness/settings'
import {
  toolPermissionRelease,
  type ReleasedGate,
} from '../../../src/entry/tool-permission-release.ts'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import type { ToolReleaseEntry } from '../../../src/entry/tool-release-manifest.ts'
import { releaseRebaseAssignments } from '../../../src/rows/governance/tool-settings-rebase.ts'

let shell: ToolReleaseEntry
beforeAll(async () => {
  const release = await loadProductionRelease()
  if (release.kind !== 'trusted') throw new Error(JSON.stringify(release))
  shell = release.manifest.entries.find(entry => entry.asset.name === 'Shell')!
})

function declared(change: (gate: ReleasedGate) => ReleasedGate = gate => gate): SettingDefinitions {
  const governance = toolPermissionRelease({
    name: 'Shell',
    adoption: shell.asset.adoption,
    module: shell.module,
    definition: shell.definition,
    gates: shell.gates.map(gate => (gate.id === 'run' ? change(gate) : gate)),
  })
  return governance.declaration.settings[0]!
}

const deny = { kind: 'value' as const, value: { pick: 'deny', allowedSet: null } }
const stored: SettingsState = {
  revision: 2,
  sources: [
    {
      id: 'tenant',
      values: [
        { itemId: 'read', value: deny, locked: false },
        { itemId: 'run', value: deny, locked: false },
      ],
    },
  ],
}
const runChanged = [
  { sourceId: 'tenant', itemId: 'read', disposition: 'retain' },
  { sourceId: 'tenant', itemId: 'run', disposition: 'discard' },
]

it('keeps every value whose item declaration is word for word the same', () => {
  expect(releaseRebaseAssignments(declared(), stored, declared())).toEqual([
    { sourceId: 'tenant', itemId: 'read', disposition: 'retain' },
    { sourceId: 'tenant', itemId: 'run', disposition: 'retain' },
  ])
})

it('drops the value of an item whose title, commands or values changed, and keeps the others', () => {
  const previous = declared()
  const retitled = declared(gate => ({ ...gate, title: `新${gate.title}` }))
  const recommanded = declared(gate => ({ ...gate, commands: [...gate.commands, 'kill'] }))
  const revalued = structuredClone(previous)
  const run = revalued.items.find(item => item.id === 'run')!
  run.presentation.enumLabels = run.presentation.enumLabels!.filter(label => label.value !== 'auto')
  for (const next of [retitled, recommanded, revalued])
    expect(releaseRebaseAssignments(previous, stored, next)).toEqual(runChanged)
})

it('drops the value of an item the new definition no longer declares', () => {
  const previous = declared()
  const without = { ...previous, items: previous.items.filter(item => item.id !== 'run') }
  expect(releaseRebaseAssignments(previous, stored, without)).toEqual(runChanged)
})
