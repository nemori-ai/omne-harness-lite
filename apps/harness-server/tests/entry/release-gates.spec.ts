import { describe, expect, it } from 'vitest'
import { loadProductionRelease } from '../../src/entry/tool-release.ts'
import { releasedGatesOf } from '../../src/entry/tool-permission-release.ts'
import { RELEASE_UNGATED } from '../../src/entry/tool-release-manifest.ts'
import { releaseCatalog } from '../rows/authorization/release-catalog.ts'

const release = await loadProductionRelease()
if (release.kind !== 'trusted') throw new Error('Production release unavailable')

// The gate table of the release, written out: id, default, and the commands under it.
const EXPECTED: Readonly<
  Record<string, readonly (readonly [string, string, readonly string[]])[]>
> = {
  Shell: [
    ['read', 'auto', ['help', 'info']],
    ['run', 'ask', ['create_session', 'execute', 'close_session']],
  ],
  Files: [
    ['read', 'auto', ['help', 'read', 'open', 'list', 'find', 'info']],
    ['write', 'ask', ['write', 'edit', 'patch', 'move', 'copy', 'delete', 'mkdir']],
  ],
  Tools: [
    ['discover', 'auto', ['help', 'search', 'inspect', 'read_result']],
    ['forward', 'auto', ['execute']],
  ],
  TodoItems: [['invoke', 'auto', ['help', 'add', 'remove', 'mark_complete', 'list']]],
  BkgToolCalls: [['invoke', 'auto', ['help', 'list', 'output', 'terminate']]],
  Ask: [],
  Web: [
    ['read', 'auto', ['help']],
    ['fetch', 'ask', ['search', 'fetch']],
  ],
  Skills: [['invoke', 'auto', ['help', 'search', 'read', 'list', 'read_file']]],
  Calendar: [['invoke', 'auto', ['help', 'day', 'count', 'shift', 'next', 'nth']]],
  Schedules: [
    ['read', 'auto', ['help', 'preview', 'list', 'show', 'history', 'recover']],
    ['draft', 'auto', ['draft', 'revise', 'discard']],
    ['activate', 'auto', ['create', 'update', 'replace', 'promote', 'pause', 'resume', 'stop']],
  ],
  Jobs: [
    ['read', 'auto', ['help', 'list', 'show']],
    ['start', 'auto', ['start']],
    ['cancel', 'auto', ['cancel']],
  ],
  Notifications: [
    ['read', 'auto', ['help', 'sent', 'inbox', 'read', 'sources', 'subscriptions']],
    ['triage', 'auto', ['done', 'dismiss', 'restore', 'unsubscribe']],
    ['send', 'ask', ['send']],
    ['subscribe', 'auto', ['subscribe']],
  ],
  Canvas: [
    ['read', 'auto', ['help', 'look', 'away', 'kinds']],
    ['arrange', 'auto', ['place', 'arrange', 'take', 'pile', 'scatter']],
    ['lock', 'deny', ['lock', 'unlock']],
  ],
  Sessions: [['invoke', 'auto', ['help', 'list', 'search', 'show', 'read']]],
  Agents: [
    ['read', 'auto', ['help', 'targets', 'show', 'list']],
    ['dispatch', 'auto', ['dispatch', 'withdraw']],
    ['message', 'auto', ['message']],
    ['report', 'auto', ['report']],
  ],
  SwitchWorkspace: [['invoke', 'ask', []]],
  OmneExtensionPoints: [['read', 'auto', ['help', 'tree', 'find', 'show', 'changes']]],
  OmneExtensions: [
    ['read', 'auto', ['help', 'categories', 'list', 'show', 'impact', 'result']],
    ['change', 'auto', ['publish', 'enable', 'disable', 'remove']],
    ['export', 'auto', ['export']],
  ],
  Screen: [
    ['read', 'auto', ['help']],
    ['observe', 'ask', ['screens', 'capture']],
  ],
}
const sorted = (names: readonly string[]) => [...names].sort()

describe('the gates of the release tools', () => {
  it('releases exactly the gate table above, each gate with its default and its commands', () => {
    expect(release.manifest.entries.map(entry => entry.asset.name).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    )
    for (const entry of release.manifest.entries) {
      const released = entry.gates.map(gate => [gate.id, gate.default, sorted(gate.commands)])
      const expected = EXPECTED[entry.asset.name]!.map(([id, pick, commands]) => [
        id,
        pick,
        sorted(commands),
      ])
      expect([entry.asset.name, released]).toEqual([entry.asset.name, expected])
    }
  })

  it('puts every command under exactly one gate, or leaves it ungated only where the release names it', async () => {
    expect(RELEASE_UNGATED).toEqual({ Ask: ['ask'] })
    const catalog = releaseCatalog(release)
    for (const entry of release.manifest.entries) {
      const inspected = await catalog.inspect({ name: entry.asset.name } as never)
      if (!('ok' in inspected) || inspected.ok.kind !== 'available') throw new Error('catalog')
      const { definition } = inspected.ok
      if (definition.kind !== 'commands') {
        // A function is one action: it stands under the one gate of its tool, which names no command.
        expect(releasedGatesOf(definition, [])).toEqual(entry.gates)
        expect([entry.asset.name, entry.gates.map(gate => gate.commands)]).toEqual([
          entry.asset.name,
          [[]],
        ])
        continue
      }
      const named = RELEASE_UNGATED[entry.asset.name] ?? []
      const gated = entry.gates.flatMap(gate => gate.commands)
      expect(new Set(gated).size).toBe(gated.length)
      expect(sorted([...gated, ...named])).toEqual(sorted(definition.commands.map(c => c.name)))
      for (const name of named)
        expect(definition.commands.find(c => c.name === name)?.release).toEqual({ gate: null })
      expect(releasedGatesOf(definition, named)).toEqual(entry.gates)
      // A tool with several gates names the gate of every command: a new command never lands silently.
      if ((definition.gates?.length ?? 0) > 1)
        expect(
          definition.commands.filter(command => command.release === undefined).map(c => c.name),
        ).toEqual([])
    }
  })
})
