import { describe, expect, it } from 'vitest'
import { loadProductionRelease } from '../../src/entry/tool-release.ts'
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
  Ask: [['invoke', 'ask', ['ask', 'request_approval']]],
  Web: [
    ['read', 'auto', ['help']],
    ['fetch', 'ask', ['search', 'fetch']],
  ],
  Skills: [['invoke', 'auto', ['help', 'search', 'read', 'list', 'read_file']]],
  Calendar: [['invoke', 'auto', ['help', 'day', 'count', 'shift', 'next', 'nth']]],
  Schedules: [
    ['read', 'auto', ['help', 'preview', 'list', 'show', 'history', 'recover']],
    ['draft', 'auto', ['revise', 'discard']],
    ['activate', 'auto', ['create', 'update', 'replace', 'promote', 'pause', 'resume', 'stop']],
  ],
  Notifications: [
    ['read', 'auto', ['help', 'sent', 'inbox', 'read', 'sources', 'subscriptions']],
    ['triage', 'auto', ['done', 'dismiss', 'restore', 'unsubscribe']],
    ['send', 'ask', ['send']],
    ['subscribe', 'auto', ['subscribe']],
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
    const catalog = releaseCatalog(release)
    for (const entry of release.manifest.entries) {
      const inspected = await catalog.inspect({ name: entry.asset.name } as never)
      if (!('ok' in inspected) || inspected.ok.kind !== 'available') throw new Error('catalog')
      const { definition } = inspected.ok
      if (definition.kind !== 'commands') throw new Error(`${entry.asset.name} has no commands`)
      const named = RELEASE_UNGATED[entry.asset.name] ?? []
      const gated = entry.gates.flatMap(gate => gate.commands)
      expect(new Set(gated).size).toBe(gated.length)
      expect(sorted([...gated, ...named])).toEqual(sorted(definition.commands.map(c => c.name)))
      // A tool with several gates names the gate of every command: a new command never lands silently.
      if ((definition.gates?.length ?? 0) > 1)
        expect(
          definition.commands.filter(command => command.release === undefined).map(c => c.name),
        ).toEqual([])
    }
  })
})
