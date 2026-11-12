// On real Cordis 4.0.4, unloading the plugin that mounted a contribution is the take-down: the
// protocol leaves the registry at once and the unload waits for the last in-flight call. No double.
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { AccessRegistryProvider } from '../src/registry/cordis.ts'
import { settleCall } from '../src/settle/settle.ts'
import { manualClock } from './support/manual-clock.ts'
import { NOTES, notesContribution, type NotesProtocol } from './support/test-contribution.ts'

const limits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 16,
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve))

/** Loads the registry provider and one access plugin that mounts `contribution`. */
async function assemble(contribution: AccessContribution<NotesProtocol>) {
  const root = new Context()
  await root.plugin(AccessRegistryProvider)
  let plugin: Fiber | undefined
  await root.plugin({
    name: 'notes-access',
    inject: ['accessRegistry'],
    apply(ctx: Context) {
      plugin = ctx.fiber
      ctx.accessRegistry.mount(contribution)
    },
  })
  if (plugin === undefined) throw new Error('the access plugin did not load')
  const registry = root.accessRegistry as unknown as AccessRegistryProvider
  return { root, plugin, registry }
}

describe('the registry on real Cordis', () => {
  it('takes the protocol down when the plugin unloads, and the unload waits for the call', async () => {
    let release!: () => void
    const released = new Promise<void>(resolve => {
      release = resolve
    })
    const events: string[] = []
    const contribution: AccessContribution<NotesProtocol> = {
      ...notesContribution('first'),
      operations: {
        ...notesContribution('first').operations,
        'save-note': async call => {
          await released
          events.push(`handler returns, aborted ${call.signal.aborted}`)
          return { outcome: 'succeeded', body: {} }
        },
      },
    }
    const { plugin, registry } = await assemble(contribution)
    const entered = registry.enter(NOTES, 'save-note')
    if (entered === undefined) throw new Error('not mounted')
    const settled = settleCall({
      entered: {
        ...entered,
        leave: () => {
          events.push('leave')
          entered.leave()
        },
      },
      principal: undefined,
      messageId: 'm-1',
      body: { noteId: 'n-1', title: 'Plan' },
      limits,
      config: { graceMs: 1000 },
      clock: manualClock(),
      respond: answer => {
        events.push(`respond ${answer.outcome}`)
      },
    })
    const unloaded = plugin.dispose().then(() => events.push('unload complete'))
    await flush()
    expect(registry.enter(NOTES, 'save-note')).toBeUndefined()
    expect(entered.signal.aborted).toBe(true)
    expect(events).toEqual([])
    release()
    await settled
    await unloaded
    expect(events).toEqual([
      'handler returns, aborted true',
      'respond succeeded',
      'leave',
      'unload complete',
    ])
  })

  it('fails the second plugin that mounts the same protocol, and the first keeps answering', async () => {
    const { root, registry } = await assemble(notesContribution('first'))
    const second = root.plugin({
      name: 'notes-access-again',
      inject: ['accessRegistry'],
      apply(ctx: Context) {
        ctx.accessRegistry.mount(notesContribution('second'))
      },
    })
    await flush()
    expect(second.uid === null || second.state !== 2).toBe(true)
    const entered = registry.enter(NOTES, 'read-note')
    if (entered?.member.kind !== 'operation') throw new Error('not mounted')
    expect(
      await entered.member.handler(
        { principal: undefined, messageId: 'm', signal: entered.signal },
        { noteId: 'n-1' },
      ),
    ).toEqual({ outcome: 'succeeded', body: { noteId: 'n-1', title: 'first' } })
    entered.leave()
  })
})
