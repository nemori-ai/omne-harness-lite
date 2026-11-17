import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { sampleReceivedToolAccount } from '@omne-harness/agent-contract/testing'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SessionOperationId } from '@omne-harness/session-contract'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import type { ToolControl, ToolState } from '@omne-harness/tool-contract'
import { sessionCallControlKey } from '@omne-harness/session-cordis-contract/cordis'
import {
  createSessionCallControlPlugin,
  createToolCallControl,
} from '../src/cordis/tool-call-control.ts'

const access = memoryAccess('tester', 'call-control')
const entry = sampleReceivedToolAccount(access.tenant, 'call-control')
if (entry.delivery.producer !== 'tool') throw new Error('fixture: a Tool entry')
const producer: { kind: 'tool'; call: string } = {
  kind: 'tool',
  call: entry.delivery.key.reference,
}

function tools(state: Partial<ToolState> | null) {
  const lookup = vi.fn(async () =>
    state === null
      ? succeed({ kind: 'not-accepted' as const, operation: 'op' as never })
      : succeed({ kind: 'found' as const, state: state as ToolState }),
  )
  const control = vi.fn(async (_input: { intent: ToolControl }) => ({
    kind: 'committed' as const,
    operation: 'top_1' as never,
    receipt: {} as never,
  }))
  return { queries: { lookup }, commands: { control } }
}

function controller(runtime: ReturnType<typeof tools> | null) {
  return createToolCallControl<string>({
    tools: () => runtime as never,
    principal: async () => succeed('session:coordinator'),
  })
}

const ask = (
  control: ReturnType<typeof controller>,
  intent: 'stop' | 'withdraw',
  call = producer,
) =>
  control.control({
    tenant: access.tenant,
    session: access.session,
    control: 'stop' as SessionOperationId,
    producer: call,
    intent,
  })

describe('Session controls a call by its reference through Tool', () => {
  it('sends a stop and a withdraw of everything to a running call', async () => {
    const runtime = tools({ phase: 'running', controls: [] })
    expect(await ask(controller(runtime), 'stop')).toEqual(succeed('recorded'))
    expect(await ask(controller(runtime), 'withdraw')).toEqual(succeed('recorded'))
    expect(runtime.commands.control.mock.calls.map(([input]) => input.intent)).toEqual([
      { kind: 'stop' },
      { kind: 'withdraw', reach: 'all' },
    ])
    const expected = {
      principal: 'session:coordinator',
      tenant: access.tenant,
      reference: producer.call,
    }
    expect(runtime.queries.lookup).toHaveBeenCalledWith(expected)
    expect(runtime.commands.control).toHaveBeenCalledWith({ ...expected, intent: { kind: 'stop' } })
  })

  it('recalls a control of the same kind that Tool already holds and sends nothing', async () => {
    const runtime = tools({ phase: 'running', controls: [{ intent: { kind: 'stop' } } as never] })
    expect(await ask(controller(runtime), 'stop')).toEqual(succeed('recorded'))
    expect(runtime.commands.control).not.toHaveBeenCalled()
  })

  it('answers ended for a settled call and sends nothing', async () => {
    const runtime = tools({ phase: 'settled', controls: [] })
    expect(await ask(controller(runtime), 'stop')).toEqual(succeed('ended'))
    expect(runtime.commands.control).not.toHaveBeenCalled()
  })

  it('an unknown commit and an absent runtime are unavailable, so Session asks again', async () => {
    const runtime = tools({ phase: 'running', controls: [] })
    runtime.commands.control.mockResolvedValueOnce({
      kind: 'commit-unknown',
      operation: 'x',
    } as never)
    expect(await ask(controller(runtime), 'stop')).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(await ask(controller(null), 'stop')).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('a refusal of Tool stays a refusal: unsupported is unsupported', async () => {
    const runtime = tools({ phase: 'running', controls: [] })
    runtime.commands.control.mockResolvedValueOnce({
      kind: 'rejected',
      failure: { kind: 'unsupported', adoption: {} as never, reason: 'not yet' },
    } as never)
    expect(await ask(controller(runtime), 'withdraw')).toEqual(fail({ kind: 'unsupported' }))
  })

  it('a reference that does not resolve is invalid and reaches no Tool', async () => {
    const runtime = tools({ phase: 'running', controls: [] })
    expect(
      await ask(controller(runtime), 'stop', { kind: 'tool', call: 'nonsense' }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'producer.call' } })
    expect(runtime.queries.lookup).not.toHaveBeenCalled()
  })

  it('asks the principal for the session of the call; a principal refusal reaches no Tool', async () => {
    const runtime = tools({ phase: 'running', controls: [] })
    const scopes: unknown[] = []
    const refused = createToolCallControl<string>({
      tools: () => runtime as never,
      principal: async scope => {
        scopes.push(scope)
        return fail({ kind: 'denied', action: 'principal' })
      },
    })
    expect(await ask(refused, 'stop')).toEqual(fail({ kind: 'denied', action: 'principal' }))
    expect(scopes).toEqual([{ tenant: access.tenant, session: access.session }])
    expect(runtime.queries.lookup).not.toHaveBeenCalled()
  })

  it('a call Tool has not accepted is unavailable; a lookup refusal keeps its kind', async () => {
    expect(await ask(controller(tools(null)), 'stop')).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    const runtime = tools({ phase: 'running', controls: [] })
    runtime.queries.lookup.mockResolvedValueOnce(
      fail({ kind: 'denied', action: 'lookup' }) as never,
    )
    expect(await ask(controller(runtime), 'stop')).toEqual(
      fail({ kind: 'denied', action: 'control-call' }),
    )
    runtime.queries.lookup.mockResolvedValueOnce(
      fail({ kind: 'commit-unknown', operation: 'x' }) as never,
    )
    expect(await ask(controller(runtime), 'stop')).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(runtime.commands.control).not.toHaveBeenCalled()
  })

  it('a held control of another kind does not stand for the one asked', async () => {
    const runtime = tools({ phase: 'running', controls: [{ intent: { kind: 'stop' } } as never] })
    expect(await ask(controller(runtime), 'withdraw')).toEqual(succeed('recorded'))
    expect(runtime.commands.control.mock.calls.map(([input]) => input.intent)).toEqual([
      { kind: 'withdraw', reach: 'all' },
    ])
  })

  it('a tenant that legal-identity did not mint is denied and reaches no Tool', async () => {
    const runtime = tools({ phase: 'running', controls: [] })
    const forged = { ...access.tenant } as typeof access.tenant
    expect(
      await controller(runtime).control({
        tenant: forged,
        session: access.session,
        control: 'stop' as SessionOperationId,
        producer,
        intent: 'stop',
      }),
    ).toEqual(fail({ kind: 'denied', action: 'control-call' }))
    expect(runtime.queries.lookup).not.toHaveBeenCalled()
  })

  it('a Tool refusal maps by kind: denied, invalid, and anything else unavailable', async () => {
    const runtime = tools({ phase: 'running', controls: [] })
    const reject = (failure: unknown) =>
      runtime.commands.control.mockResolvedValueOnce({ kind: 'rejected', failure } as never)
    reject({ kind: 'denied', action: 'control' })
    expect(await ask(controller(runtime), 'stop')).toEqual(
      fail({ kind: 'denied', action: 'control-call' }),
    )
    reject({ kind: 'invalid', field: 'intent', reason: 'type' })
    expect(await ask(controller(runtime), 'stop')).toEqual(
      fail({ kind: 'invalid', field: 'intent', reason: 'type' }),
    )
    reject({ kind: 'busy' })
    expect(await ask(controller(runtime), 'stop')).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session-adapters/tool-call-control' },
    })
  })
})

describe('the Cordis plugin', () => {
  it('provides sessionCallControl with the same control, and takes it down with the plugin', async () => {
    const runtime = tools({ phase: 'running', controls: [] })
    const root = new Context()
    const plugin = await root.plugin(
      createSessionCallControlPlugin<string>({
        tools: () => runtime as never,
        principal: async () => succeed('session:coordinator'),
      }),
    )
    const provided = root.get(sessionCallControlKey) as ReturnType<typeof controller> | undefined
    if (provided === undefined) throw new Error('sessionCallControl is not provided')
    expect(await ask(provided, 'stop')).toEqual(succeed('recorded'))
    await plugin.dispose()
    expect(root.get(sessionCallControlKey)).toBeUndefined()
  })
})
