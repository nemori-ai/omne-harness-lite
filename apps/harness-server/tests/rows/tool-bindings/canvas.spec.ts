import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { canvasOf } from '@omne-harness/canvas-tools'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { SESSION_WORK_OWNER } from '../../../src/rows/authorization/principals.ts'
import { canvasMovers } from '../../../src/rows/canvas/movers.ts'
import { bindReleaseCanvas } from '../../../src/rows/tool-bindings/canvas.ts'
import { liveCallOrigin } from '../../../src/rows/tool-bindings/live-calls.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { SESSION_WORK_COMPONENT } from '../../../src/rows/tool-runtime/session-work.ts'
import { StubService } from '../../../src/s0/stub-plugin.ts'

const tenantOf = (account: string): TenantId => {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'a'.repeat(26)}`, account: `acc_${account.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}
const A = tenantOf('1')
const B = tenantOf('2')
const textOf = (tenant: TenantId) => (tenantCodec.encode(tenant) as { value: string }).value
const work = (tenant: TenantId, session = 'session-1') => ({
  kind: 'acting-for-tenant',
  actor: { kind: 'system', component: SESSION_WORK_COMPONENT },
  tenant,
  work: { owner: SESSION_WORK_OWNER, work: session },
})

/** A tree where the canvas stands or not, and the verifier answers as told. */
async function world(canvas = true) {
  const root = new Context()
  if (canvas)
    await root.plugin({
      name: 'canvas',
      apply: (ctx: Context) => void new StubService(ctx, 'canvas' as never, 'canvas', {}),
    })
  const state = { verified: work(A) as unknown }
  toolRuntimeHolder(root).verifier = () =>
    ({
      async verify() {
        return state.verified === null
          ? { kind: 'rejected' }
          : { kind: 'verified', principal: state.verified }
      },
    }) as unknown as PrincipalVerifier
  const finished: unknown[] = []
  const scope = {
    context: { signal: new AbortController().signal },
    limits: {},
    finish: async (exit: unknown) => void finished.push(exit),
  } as unknown as ToolExecutionScope
  const bind = (tenant: TenantId = A) =>
    bindReleaseCanvas(
      root,
      { principal: work(tenant), tenant, call: 'call-1', request: {} } as never,
      scope,
    )
  return { root, state, bind, finished, movers: canvasMovers(liveCallOrigin(root)) }
}

describe('the Canvas binding of the release', () => {
  it('reaches the canvas with the tenant and the call, so the canvas names the agent of the verified session', async () => {
    const w = await world()
    const attached = w.bind()
    const reached = await canvasOf(attached.context)?.reach()
    if (reached === undefined || 'unreachable' in reached) throw new Error('unreached')
    expect(reached.context).toMatchObject({ tenant: textOf(A), call: 'call-1' })
    expect(await w.movers.moverOf(reached.context)).toEqual({
      kind: 'agent',
      session: 'session-1',
    })
    await attached.finish({ kind: 'done' } as never)
    expect(await w.movers.moverOf(reached.context)).toBeNull()
  })

  it('takes the session from the verified principal of each call, and is unavailable when it does not verify', async () => {
    const w = await world()
    const bound = canvasOf(w.bind().context)
    w.state.verified = null
    expect(await bound?.reach()).toEqual({ unreachable: 'unavailable' })
  })

  it('is unavailable while the canvas is not there, or for a principal of another tenant', async () => {
    expect(await canvasOf((await world(false)).bind().context)?.reach()).toEqual({
      unreachable: 'unavailable',
    })
    const w = await world()
    w.state.verified = work(B)
    expect(await canvasOf(w.bind(A).context)?.reach()).toEqual({ unreachable: 'unavailable' })
  })

  it('withdraws what it attached when the call finishes, and finishes the scope it wrapped once', async () => {
    const w = await world()
    const attached = w.bind()
    await attached.finish({ kind: 'done' } as never)
    await attached.finish({ kind: 'done' } as never)
    expect(canvasOf(attached.context)).toBeUndefined()
    expect(w.finished).toHaveLength(1)
  })
})
