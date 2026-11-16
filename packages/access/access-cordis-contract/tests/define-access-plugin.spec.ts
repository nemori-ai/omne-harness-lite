import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { defineProtocol, ruleCodec, type ProtocolContract } from '@omne-harness/public-contract'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import {
  AccessRegistryService,
  defineAccessPlugin,
} from '@omne-harness/access-cordis-contract/cordis'

class KeepingRegistry extends AccessRegistryService {
  readonly mounted = new Map<string, AccessContribution<ProtocolContract>>()
  protected attach(contribution: AccessContribution<ProtocolContract>): () => Promise<void> {
    this.mounted.set(contribution.protocol.name, contribution)
    return async () => {
      this.mounted.delete(contribution.protocol.name)
    }
  }
}

class Clock extends Service {
  readonly now = 42
  constructor(ctx: Context) {
    super(ctx, 'clock')
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    clock: Clock
  }
}

const empty = ruleCodec({ kind: 'object', fields: {} })
const time = defineProtocol({
  name: 'time',
  major: 1,
  operations: {
    now: {
      identity: 'none',
      effect: 'read',
      limit: 'small',
      body: empty,
      outcomes: {
        succeeded: ruleCodec({
          kind: 'object',
          fields: { now: { rule: { kind: 'positive-integer' } } },
        }),
      },
    },
  },
  observations: {},
})

const timeAccess = defineAccessPlugin({
  name: 'time-access',
  protocol: time,
  handlers: provide => ({
    operations: {
      now: async () => {
        const clock = provide('clock')
        if (clock === undefined) return { outcome: 'basis-unavailable' }
        return { outcome: 'succeeded', body: { now: clock.now } }
      },
    },
    observations: {},
  }),
})

describe('defineAccessPlugin', () => {
  it('mounts on load, takes the service at each call, and takes down on unload', async () => {
    const root = new Context()
    await root.plugin(KeepingRegistry)
    const registry = root.accessRegistry as unknown as KeepingRegistry
    const call = () =>
      registry.mounted
        .get('time')
        ?.operations['now']?.(
          { principal: undefined, messageId: 'm', signal: new AbortController().signal } as never,
          {} as never,
        )
    const plugin = root.plugin(timeAccess)
    await plugin
    expect(registry.mounted.get('time')?.protocol).toBe(time)
    expect(await call()).toEqual({ outcome: 'basis-unavailable' })
    const clock = root.plugin(Clock)
    await clock
    expect(await call()).toEqual({ outcome: 'succeeded', body: { now: 42 } })
    await clock.dispose()
    expect(await call()).toEqual({ outcome: 'basis-unavailable' })
    expect(registry.mounted.has('time')).toBe(true)
    await plugin.dispose()
    expect(registry.mounted.has('time')).toBe(false)
  })
})
