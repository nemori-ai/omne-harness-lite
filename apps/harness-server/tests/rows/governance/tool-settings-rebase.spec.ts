import { beforeAll, expect, it } from 'vitest'
import type { SettingDefinitions, SettingsState } from '@omne-harness/settings'
import {
  toolPermissionRelease,
  type ReleasedGate,
} from '../../../src/entry/tool-permission-release.ts'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import type { ToolReleaseEntry } from '../../../src/entry/tool-release-manifest.ts'
import {
  reconcileToolSettings,
  releaseRebaseAssignments,
  type ReleaseSettingsMaintenance,
} from '../../../src/rows/governance/tool-settings-rebase.ts'

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

const definitionRef = { owner: 'asset:tool/Shell', id: 'gates', revision: 'r1' } as never
const tool = {
  name: 'Shell',
  assetRef: 'tool/Shell',
  target: { owner: 'asset:tool/Shell' } as never,
}

function reconciliation(
  observe: Awaited<ReturnType<ReleaseSettingsMaintenance['observe']>>,
  versions: 'readable' | 'unreadable',
  rebase: Awaited<ReturnType<ReleaseSettingsMaintenance['rebase']>>,
) {
  const warnings: string[] = []
  const input = {
    tenantRef: 'tenant-a',
    warn: (message: string) => warnings.push(message),
    releaseSettings: { observe: async () => observe, rebase: async () => rebase },
    assets: {
      listVersions: async () =>
        versions === 'readable'
          ? { kind: 'page', versions: ['v1'], next: null }
          : { kind: 'unavailable' },
      readVersion: async () => ({
        kind: 'version',
        version: { declaration: { kind: 'declared', definitionRef, definition: declared() } },
      }),
    },
  } as never
  return { input, warnings }
}

const changed = { kind: 'changed', stored: { definitionRef, state: stored } } as const

it('warns once, naming the step, whenever a reconciliation could not finish and is left to the next open', async () => {
  const cases = [
    reconciliation({ kind: 'unknown' }, 'readable', { kind: 'current' }),
    reconciliation(changed, 'unreadable', { kind: 'current' }),
    reconciliation(changed, 'readable', { kind: 'unavailable', phase: 'commit' }),
  ]
  for (const { input } of cases) await reconcileToolSettings(input, tool)
  expect(cases.map(item => item.warnings.length)).toEqual([1, 1, 1])
  expect(cases[0]!.warnings[0]).toContain('settings projection unavailable')
  expect(cases[1]!.warnings[0]).toContain('versions of tool/Shell unavailable')
  expect(cases[2]!.warnings[0]).toContain('rebase commit unavailable')
  for (const { warnings } of cases)
    expect(warnings[0]).toContain('the next open of governance tries again')
})

it('stays quiet when the target is current or the rebase is done', async () => {
  const cases = [
    reconciliation({ kind: 'current' }, 'readable', { kind: 'current' }),
    reconciliation(changed, 'readable', { kind: 'rebased', revision: 3 }),
  ]
  for (const { input } of cases) await reconcileToolSettings(input, tool)
  expect(cases.map(item => item.warnings)).toEqual([[], []])
})
