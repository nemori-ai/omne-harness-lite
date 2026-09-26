import { expect, it, vi } from 'vitest'
import type {
  ActionReport,
  GovernanceClientOperations,
  InputPrompt,
} from '@omne-harness-lite/governance-client-operations'
import { runTui, tuiProviders, type TuiRuntime } from '../src/tui/application.ts'
import { FakeTerminal, tick } from './support/tui.ts'
import { validIntent, validReport } from '../src/validation.ts'
import { forms } from '../src/tui/forms.ts'
const centerId = '1'.repeat(32)
const origin = { centerId, accountId: 'alice', loginStateHandle: 'h' }
const tenant = { account: 'alice', organization: 'personal' }
const OG = 'capability.organization-governance/v2#S-'
function report(
  operation: string | null,
  result: unknown,
  action: ActionReport['action'] = 'invoke',
): ActionReport {
  return {
    format: 'governance-client/1',
    actionId: 'test-action',
    action,
    operation,
    origin,
    admission: { status: 'admitted' },
    remote: {
      status: 'success',
      stage: 'operation',
      sendAttempted: true,
      ...(operation ? { reply: { operation, reply: { result } } } : {}),
    },
    local: { status: 'not-requested' },
    view: {
      source: 'online',
      acquiredAt: '2026-09-25T00:00:00.000Z',
      ...(operation
        ? {
            data: { operation, reply: { result } },
            query: {
              operation,
              payload: operation === OG + '60' ? { expectedTenant: tenant } : {},
            },
          }
        : {}),
      tenant,
    },
    use: 'active',
  }
}
function fixture() {
  const terminal = new FakeTerminal(),
    controller = new AbortController(),
    order: string[] = [],
    outputs: string[] = []
  const state = {
    read: vi.fn(),
    compareAndReplace: vi.fn(),
    close: vi.fn(async () => {
      order.push('state-close')
    }),
  }
  const invoke = vi.fn(async (intent: unknown, prompt: InputPrompt) => {
    if (!validIntent(intent)) throw new Error('invalid input in fixture')
    if (intent.action !== 'invoke' && intent.action !== 'health')
      throw new Error('unexpected action')
    const completion = await prompt(
      { intent, origin, endpoint: 'https://center.invalid/', source: 'verified-center' },
      controller.signal,
    )
    expect(completion).toEqual({ kind: 'continue', secrets: {} })
    if (intent.action === 'health')
      return {
        ...report(null, undefined, 'health'),
        remote: {
          status: 'success' as const,
          stage: 'health' as const,
          sendAttempted: false,
          health: { reachable: true as const, centerId, version: 'test' },
        },
        view: { source: 'none' as const },
        use: 'ended' as const,
      }
    const value = report(intent.operation, intent.operation === OG + '36' ? tenant : [])
    expect(validReport(value), intent.operation).toBe(true)
    return value
  })
  const use = { run: vi.fn(), runPrepared: invoke, close: vi.fn(async () => {}) }
  const client: GovernanceClientOperations = {
    runAction: vi.fn(),
    runPrepared: invoke,
    openUse: vi.fn(async () => ({ kind: 'use' as const, use, origin })),
    close: vi.fn(async () => {
      order.push('cg-close')
    }),
  }
  const originalRestore = terminal.restore.bind(terminal)
  terminal.restore = async () => {
    order.push('restore')
    await originalRestore()
  }
  const runtime: TuiRuntime = {
    ...tuiProviders(),
    home: '/home',
    signal: controller.signal,
    terminal: vi.fn(async () => terminal),
    openState: vi.fn(async () => state),
    createClient: () => client,
    stdout: async text => {
      outputs.push(text)
    },
    stderr: async text => {
      outputs.push(text)
    },
  }
  const respond = async (text: string) => {
    terminal.paste(text)
    await tick()
    terminal.key('\r')
  }
  return { terminal, controller, order, outputs, state, client, invoke, runtime, respond }
}
it('help and invalid syntax are pure, without state or terminal access', async () => {
  const f = fixture()
  expect(await runTui(['tui', '--help'], f.runtime)).toBe(0)
  expect(await runTui(['tui', '--setup'], f.runtime)).toBe(2)
  expect(f.runtime.openState).not.toHaveBeenCalled()
  expect(f.runtime.terminal).not.toHaveBeenCalled()
})
it('signal cancellation before any CG report is status 2, while normal menu exit is 0', async () => {
  const f = fixture()
  f.terminal.onFrame = () => f.controller.abort()
  expect(await runTui(['tui', '--terminal-profile', 'xterm-379', '--setup'], f.runtime)).toBe(2)
  expect(f.outputs.join('')).toContain('input-cancelled')
  expect(f.terminal.restored).toBe(true)
})
it('output failure outside a write callback closes with status 70', async () => {
  const f = fixture()
  f.terminal.onFrame = () => f.terminal.handler({ kind: 'output-error' })
  expect(await runTui(['tui', '--terminal-profile', 'xterm-379', '--setup'], f.runtime)).toBe(70)
  expect(f.outputs.join('')).toContain('output-failed')
})
it('governance entry reads identity and both inboxes on one use, then closes CG/terminal/CLS in order', async () => {
  for (const id of ['36', '57', '60'])
    expect(validReport(report(OG + id, id === '36' ? tenant : [])), id).toBe(true)
  const f = fixture()
  let menu = false
  f.terminal.onFrame = bytes => {
    if (bytes.includes('exit status')) f.terminal.key('\r')
    else if (bytes.includes('Refresh identity and inboxes') && !menu) {
      menu = true
      void f.respond('1')
    }
  }
  const result = await runTui(['tui', '--terminal-profile', 'xterm-379'], f.runtime)
  expect(
    result,
    JSON.stringify({ outputs: f.outputs, calls: f.invoke.mock.calls.map(c => c[0]) }),
  ).toBe(0)
  expect(f.client.openUse).toHaveBeenCalledTimes(1)
  expect(f.invoke.mock.calls.map(c => c[0])).toEqual([
    { action: 'invoke', operation: OG + '36', payload: {}, readMode: 'refresh' },
    { action: 'invoke', operation: OG + '57', payload: {}, readMode: 'refresh' },
    {
      action: 'invoke',
      operation: OG + '60',
      payload: { expectedTenant: tenant },
      readMode: 'refresh',
    },
  ])
  expect(f.terminal.frames.some(x => x.includes('Organization: personal'))).toBe(true)
  expect(f.order).toEqual(['cg-close', 'restore', 'state-close'])
})
it('setup performs one root action, never opens a use and does not reopen after the result', async () => {
  const f = fixture()
  let selected = false
  f.terminal.onFrame = bytes => {
    if (bytes.includes('One action per setup') && !selected) {
      selected = true
      void f.respond('5')
    } else if (bytes.includes('exit status')) f.terminal.key('\r')
  }
  expect(await runTui(['tui', '--terminal-profile', 'xterm-379', '--setup'], f.runtime)).toBe(0)
  expect(f.client.openUse).not.toHaveBeenCalled()
  expect(f.invoke).toHaveBeenCalledTimes(1)
  expect(f.invoke.mock.calls[0]?.[0]).toEqual({ action: 'health' })
})
it.each(['cancelled', 'rejected', 'success'] as const)(
  'identity switch %s only reads identity again after a successful Ack',
  async outcome => {
    const f = fixture()
    const original = f.invoke.getMockImplementation()!
    f.invoke.mockImplementation(async (intent, prompt) => {
      if (!validIntent(intent)) throw new Error('invalid fixture input')
      if (intent.action !== 'invoke' || intent.operation !== OG + '37')
        return original(intent, prompt)
      const completion = await prompt(
        { intent, origin, endpoint: 'https://center.invalid/', source: 'verified-center' },
        f.controller.signal,
      )
      expect(completion.kind).toBe(outcome === 'cancelled' ? 'cancelled' : 'continue')
      const response: ActionReport = {
        ...report(OG + '37', 'ok'),
        view: { source: 'none' },
        ...(outcome === 'cancelled'
          ? {
              admission: { status: 'blocked', reason: 'invalid-input' },
              remote: { status: 'not-attempted', stage: 'none', sendAttempted: false },
            }
          : outcome === 'rejected'
            ? {
                remote: {
                  status: 'rejected',
                  stage: 'operation',
                  sendAttempted: true,
                  reply: { operation: OG + '37', reply: { failure: 'expectedTenantMismatch' } },
                },
              }
            : {}),
      }
      expect(validReport(response)).toBe(true)
      return response
    })
    let step = 0
    const menu = String(
      forms
        .filter(form => form.phase === 'governance')
        .findIndex(form => form.id === 'tenant switch') + 3,
    )
    f.terminal.onFrame = bytes => {
      if (bytes.includes('exit status')) f.terminal.key('\r')
      else if (step === 0 && bytes.includes('Refresh identity and inboxes')) {
        step++
        void f.respond(menu)
      } else if (step === 1 && bytes.includes('Target tenant identity: account ID')) {
        step++
        void f.respond('alice')
      } else if (step === 2 && bytes.includes('Target tenant identity: organization ID')) {
        step++
        void f.respond('team')
      } else if (step === 3 && bytes.includes('Confirm: Tenant switch')) {
        step++
        void f.respond(outcome === 'cancelled' ? '1' : '2')
      } else if (step === 4 && bytes.includes('Refresh identity and inboxes')) {
        step++
        void f.respond('1')
      }
    }
    expect(await runTui(['tui', '--terminal-profile', 'xterm-379'], f.runtime)).toBe(
      outcome === 'cancelled' ? 2 : outcome === 'rejected' ? 4 : 0,
    )
    expect(
      f.invoke.mock.calls.map(call =>
        validIntent(call[0]) && call[0].action === 'invoke' ? call[0].operation : null,
      ),
    ).toEqual([
      OG + '36',
      OG + '57',
      OG + '60',
      OG + '37',
      ...(outcome === 'success' ? [OG + '36'] : []),
    ])
    expect(f.terminal.restored).toBe(true)
  },
)
it('close failure changes a successful result to 70 and never closes borrowed state', async () => {
  const f = fixture()
  f.client.close = vi.fn(async () => {
    throw new Error('secret exception')
  })
  f.terminal.onFrame = () => f.controller.abort()
  expect(await runTui(['tui', '--terminal-profile', 'xterm-379', '--setup'], f.runtime)).toBe(70)
  expect(f.state.close).not.toHaveBeenCalled()
  expect(f.terminal.restored).toBe(false)
  expect(f.outputs.join('')).toContain('client-close-failed')
  expect(f.outputs.join('')).not.toContain('secret exception')
})
