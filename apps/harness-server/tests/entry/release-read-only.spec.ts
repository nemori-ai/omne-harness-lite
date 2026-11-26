import { describe, expect, it } from 'vitest'
import { isReadOnlyCall } from '@omne-harness/tool-contract'
import { loadProductionRelease } from '../../src/entry/tool-release.ts'
import { releaseCatalog } from '../rows/authorization/release-catalog.ts'

const release = await loadProductionRelease()
if (release.kind !== 'trusted') throw new Error('Production release unavailable')

// TL-74, written out: the commands of the release that change nothing another call can observe.
// Every other command has effects. A new command is not read-only until it is named here.
const READ_ONLY: Readonly<Record<string, readonly string[]>> = {
  Shell: ['info', 'help'],
  Files: ['read', 'open', 'list', 'find', 'info', 'help'],
  Tools: ['help', 'search', 'inspect', 'read_result'],
  TodoItems: ['help', 'list'],
  BkgToolCalls: ['help', 'list', 'output'],
  Ask: ['ask'],
  Web: ['help', 'search', 'fetch'],
  Skills: ['help', 'search', 'read', 'list', 'read_file'],
  Calendar: ['help', 'day', 'count', 'shift', 'next', 'nth'],
  Schedules: ['help', 'preview', 'list', 'show', 'history', 'recover'],
  Jobs: ['help', 'list', 'show'],
  Sessions: ['help', 'list', 'search', 'show', 'read'],
  Agents: ['help', 'targets', 'show', 'list'],
  Goal: ['help', 'show', 'brief'],
  Notifications: ['help', 'sent', 'inbox', 'read', 'sources', 'subscriptions'],
  SwitchWorkspace: [],
  OmneExtensionPoints: ['help', 'tree', 'find', 'show', 'changes'],
  OmneExtensions: ['help', 'categories', 'list', 'show', 'impact', 'result', 'settings'],
  Screen: ['help', 'screens', 'capture'],
  Code: ['help'],
  Canvas: ['help', 'look', 'away', 'kinds'],
}

describe('the read-only commands of the release', () => {
  it('are exactly the ones written here, tool by tool', async () => {
    const catalog = releaseCatalog(release)
    const declared: Record<string, readonly string[]> = {}
    for (const entry of release.manifest.entries) {
      const inspected = await catalog.inspect({ name: entry.asset.name } as never)
      if (!('ok' in inspected) || inspected.ok.kind !== 'available') throw new Error('catalog')
      const { definition } = inspected.ok
      const names =
        definition.kind === 'commands' ? definition.commands.map(command => command.name) : [null]
      declared[entry.asset.name] = names
        .filter(name => isReadOnlyCall(definition, name))
        .map(name => name ?? '(the function)')
        .sort()
    }
    const expected = Object.fromEntries(
      Object.entries(READ_ONLY).map(([tool, commands]) => [tool, [...commands].sort()]),
    )
    expect(declared).toEqual(expected)
  })
})
