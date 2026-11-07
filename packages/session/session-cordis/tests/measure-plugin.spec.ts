// `createSessionProviderPlugin` on real Cordis 4.0.4 (Session SPEC「测量事件」, session-cordis SPEC
// 「测量事件的插件入口」): the observer given to the plugin factory reaches the session instance
// that the plugin builds, so an operation through the real plugin emits the Session segments. The
// session instance is the real factory over the in-memory transaction pair.
import type { SessionDiagnostic, SessionMeasureEvent } from '@omne-harness/session'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionProvider, createSessionProviderPlugin } from '../src/cordis.ts'
import { assemble, FIBER_STATE, type Assembly } from './fixtures/assembly.ts'

const open: Assembly[] = []
afterEach(async () => {
  for (const assembly of open.splice(0)) await assembly.close()
})

async function build(
  plugin: typeof SessionProvider,
  options: Omit<Parameters<typeof assemble>[0] & object, 'plugin'> = {},
): Promise<Assembly> {
  const assembly = await assemble({ ...options, plugin })
  open.push(assembly)
  return assembly
}

describe('createSessionProviderPlugin', () => {
  it('hands the observer to the session instance, so a create emits a paired segment', async () => {
    const events: SessionMeasureEvent[] = []
    const a = await build(createSessionProviderPlugin({ measure: event => events.push(event) }))
    expect(a.provider.state as number).toBe(FIBER_STATE.ACTIVE)
    await a.create(await a.caller('intake'))
    // The instance may measure operations of its own scanners too, so look for the create by name.
    const segments = events.filter(event => event.kind === 'segment')
    const start = segments.find(event => event.phase === 'start' && event.operation === 'create')
    const end = segments.find(event => event.phase === 'end' && event.span === start?.span)
    expect(start).toBeDefined()
    expect(end).toMatchObject({ operation: 'create', outcome: 'ok' })
  })

  it('has the inject and the configuration of SessionProvider, and serves without an observer', async () => {
    const Plugin = createSessionProviderPlugin()
    expect(Plugin).not.toBe(SessionProvider)
    expect(Plugin.inject).toBe(SessionProvider.inject)
    expect(Plugin.Config).toBe(SessionProvider.Config)
    const a = await build(Plugin)
    expect(a.provider.state as number).toBe(FIBER_STATE.ACTIVE)
    expect((await a.create(await a.caller('intake'))).revision).toBeDefined()
  })

  it('hands the diagnose observer to the session instance, so a stopped coordinator step reaches it', async () => {
    const diagnostics: SessionDiagnostic[] = []
    // Without the Agent drive port, C2 stops its `invoke` step with `agent-absent` (session SPEC 诊断出口).
    const a = await build(
      createSessionProviderPlugin({ diagnose: diagnostic => diagnostics.push(diagnostic) }),
      { omit: ['sessionAgentDrive'] },
    )
    expect(a.provider.state as number).toBe(FIBER_STATE.ACTIVE)
    const intake = await a.caller('intake')
    await a.create(intake)
    // Bound before the accept, so the accept commit itself wakes S1 and it grants the Run.
    a.bindings.controls.bind(a.tenant, a.sessionId('session-1'))
    await a.accept(intake, 'input-1')
    await expect.poll(() => diagnostics.length, { timeout: 5000 }).toBeGreaterThan(0)
    expect(diagnostics[0]).toMatchObject({
      owner: 'C2',
      step: 'invoke',
      reason: 'agent-absent',
      session: a.sessionId('session-1'),
      tenant: a.tenant,
    })
  })
})
