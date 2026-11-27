import { interfaceProtocol, type InspectionAsked } from '@omne-harness/interface-protocol'
import { DEFAULT_MODE } from '@omne-harness/interface-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { ScopeSource, ShellLogin, ShellLoginState } from '@omne-harness/shell-contract'
import {
  ReferenceShell,
  protocolsPoint,
  servedProtocol,
  startShellOf,
} from '@omne-harness/shell-contract/testing'
import { describe, expect, it } from 'vitest'
import { createInterfaceUiModule, type InterfaceClient } from '../src/cordis.ts'

const TENANT_A =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const TENANT_B =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}'

/** A shell whose login and tenant the case turns. */
class TurnedShell extends ReferenceShell {
  state: ShellLoginState = 'signed-in'
  private readonly told = new Set<() => void>()
  override readonly login: ShellLogin = {
    state: () => this.state,
    subscribe: listener => this.listen(() => listener(this.state)),
    login: async () => 'signed-in',
    logout: async () => 'signed-out',
  }
  override readonly scope: ScopeSource = {
    get: () => this.tenant,
    set: () => undefined,
    subscribe: listener => this.listen(() => listener(this.tenant)),
  }
  private listen(listener: () => void): () => void {
    this.told.add(listener)
    return () => void this.told.delete(listener)
  }
  change(to: Partial<{ state: ShellLoginState; tenant: string | undefined }>): void {
    Object.assign(this, to)
    for (const listener of [...this.told]) listener()
  }
}

type Stream = { push(asked: InspectionAsked): void; end(value?: unknown): void; ended: boolean }

function fakeClient() {
  const streams: (Stream & { body: unknown })[] = []
  const delivered: unknown[] = []
  const client = {
    observe: {
      'observe-requests': (body: unknown, { signal }: { signal: AbortSignal }) => {
        const waiting: InspectionAsked[] = []
        let wake: (() => void) | undefined
        let end: { value: unknown } | undefined
        const stream = {
          body,
          ended: false,
          push(asked: InspectionAsked) {
            waiting.push(asked)
            wake?.()
          },
          end(value: unknown = { kind: 'ended', reason: 'unavailable' }) {
            stream.ended = true
            end = { value }
            wake?.()
          },
        }
        signal.addEventListener('abort', () => stream.end({ kind: 'ended', reason: 'cancelled' }))
        streams.push(stream)
        return {
          async next() {
            while (waiting.length === 0 && end === undefined)
              await new Promise<void>(resolve => (wake = resolve))
            const value = waiting.shift()
            return value === undefined
              ? { done: true as const, value: end?.value }
              : { done: false as const, value }
          },
        }
      },
    },
    deliver: async (body: unknown) => {
      delivered.push(body)
      return { outcome: 'succeeded', body: {} }
    },
  }
  return { client: client as unknown as InterfaceClient, streams, delivered }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

async function started(shellTenant: string | undefined) {
  const { root, shell } = await startShellOf(TurnedShell)
  shell.tenant = shellTenant
  const fake = fakeClient()
  await root.plugin(protocolsPoint)
  await root.plugin(servedProtocol(interfaceProtocol, fake.client))
  await root.plugin(
    createInterfaceUiModule({
      clientId: () => 'client-1',
      draw: async ({ page }) => ({ kind: 'image', bytes: new Uint8Array([1]), width: page.length, height: 1 }),
      sleep: async () => undefined,
    }),
  )
  await tick()
  return { shell, ...fake }
}

describe('the interface module', () => {
  it('observes for the tenant signed in and delivers what the host drew, as this client', async () => {
    const { streams, delivered } = await started(TENANT_A)
    expect(streams.map(stream => stream.body)).toEqual([
      { tenant: readTenantText(TENANT_A), client: 'client-1' },
    ])
    streams[0]!.push({ request: 'r1', page: 'notes', mode: DEFAULT_MODE })
    await tick()
    expect(delivered).toEqual([
      {
        tenant: readTenantText(TENANT_A),
        client: 'client-1',
        request: 'r1',
        result: { kind: 'image', bytes: new Uint8Array([1]), width: 5, height: 1 },
      },
    ])
  })

  it('opens the observation again when it ended, but not when the server denied it', async () => {
    const { streams } = await started(TENANT_A)
    streams[0]!.end()
    await tick()
    expect(streams).toHaveLength(2)
    streams[1]!.end({ kind: 'ended', reason: 'denied' })
    await tick()
    expect(streams).toHaveLength(2)
  })

  it('follows the tenant: another tenant gets its own observation, signing out leaves none open', async () => {
    const { shell, streams } = await started(undefined)
    expect(streams).toEqual([])
    shell.change({ tenant: TENANT_A })
    await tick()
    shell.change({ tenant: TENANT_B })
    await tick()
    expect(streams.map(stream => [(stream.body as { tenant: unknown }).tenant, stream.ended])).toEqual([
      [readTenantText(TENANT_A), true],
      [readTenantText(TENANT_B), false],
    ])
    shell.change({ state: 'signed-out' })
    await tick()
    expect(streams.every(stream => stream.ended)).toBe(true)
    expect(streams).toHaveLength(2)
  })
})
