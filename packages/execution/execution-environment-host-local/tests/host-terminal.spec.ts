import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { createHostFilesDomain } from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  filesFacilityPlugin,
  commandFacilityPlugin,
  terminalFacilityPlugin,
  createHostFilesPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'
import { testPorts } from './ports.ts'
import { createTerminalOutput } from '../src/terminal-output.ts'
import { createTerminalReader } from '../src/terminal-control.ts'

it('loads the terminal declaration in real Cordis and removes only that declaration', async () => {
  const tenant = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  const scope = decodeScopeRef({ ref: 'terminal-cordis' })
  if (!tenant.ok || !('ok' in scope)) throw new Error('identity fixture')
  const ctx = new Context()
  await testPorts(tenant.value).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  await ctx.plugin(filesFacilityPlugin)
  await ctx.plugin(commandFacilityPlugin)
  const plugin = createHostFilesPlugin(createHostFilesDomain())
  expect(
    plugin.Config['~standard'].validate({
      terminal: { maxBufferedBytes: 1024, maxChunkBytes: 128, maxControlBytes: 1024 },
    }),
  ).toHaveProperty('value')
  expect(plugin.Config['~standard'].validate({ terminal: { maxControlBytes: 1 } })).toHaveProperty(
    'issues',
  )
  const host = await ctx.plugin(plugin)
  const declaration = await ctx.plugin(terminalFacilityPlugin)
  const service = ctx.get(executionEnvironmentKey)
  if (service === undefined) throw new Error('service missing')
  const placement = () =>
    service.resolvePlacement(
      { principal: 'test', tenant: tenant.value },
      {
        scope: scope.ok,
        requirement: {
          allowedBindings: [{ kind: 'host_machine' }],
          facilities: ['files', 'command', 'terminal'],
          isolation: [],
        },
      },
    )
  try {
    expect(await placement()).toMatchObject({ kind: 'placement', provider: { name: 'host-files' } })
    await declaration.dispose()
    expect(await placement()).toMatchObject({ kind: 'rejected', reason: 'missingFacility' })
  } finally {
    await host.dispose()
  }
})

describe('terminal byte ownership', () => {
  it('serializes concurrent reads from the single iterator without losing a wakeup', async () => {
    const output = createTerminalOutput({ maxBufferedBytes: 8, maxChunkBytes: 1 })
    const reader = output.output[Symbol.asyncIterator]()
    const first = reader.next()
    const second = reader.next()
    output.push(Uint8Array.of(1, 2))
    output.close()
    expect((await first).value?.data).toEqual(Uint8Array.of(1))
    expect((await second).value?.data).toEqual(Uint8Array.of(2))
  })
  it('keeps raw bytes, gaps, and one reader without decoding text', async () => {
    const output = createTerminalOutput({ maxBufferedBytes: 4, maxChunkBytes: 4 })
    output.push(Uint8Array.of(0xff, 0x1b, 0x0d, 0x0a))
    output.push(Uint8Array.of(1, 2))
    const reader = output.output[Symbol.asyncIterator]()
    expect(await reader.next()).toEqual({
      done: false,
      value: { stream: 'terminal', data: Uint8Array.of(0xff, 0x1b, 0x0d, 0x0a), observedOffset: 0 },
    })
    output.push(Uint8Array.of(3))
    expect(await reader.next()).toMatchObject({ value: { observedOffset: 6 } })
    await expect(output.output[Symbol.asyncIterator]().next()).rejects.toThrow(TypeError)
    await reader.return?.()
    output.push(Uint8Array.of(4))
    output.close()
    expect(output.summary()).toEqual({
      mode: 'terminal',
      terminal: { observedBytes: 8, discardedBytes: 3 },
    })
  })
})

describe('terminal private frames', () => {
  const bytes = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`)
  it('rejects another generation, late legs, and overlong frames permanently', () => {
    const reader = createTerminalReader({ generation: 'g', maxChunkBytes: 8, maxControlBytes: 256 })
    expect(reader.push(bytes({ t: 'ready', generation: 'other' }))).toMatchObject({ kind: 'fault' })
    expect(reader.push(bytes({ t: 'ready', generation: 'g' }))).toMatchObject({ kind: 'fault' })
    const late = createTerminalReader({ generation: 'g', maxChunkBytes: 8, maxControlBytes: 256 })
    late.expectLeg('leg')
    expect(late.push(bytes({ t: 'started', generation: 'g', leg: 'old' }))).toMatchObject({
      kind: 'fault',
    })
    const long = createTerminalReader({ generation: 'g', maxChunkBytes: 8, maxControlBytes: 256 })
    expect(long.push(Buffer.alloc(257, 97))).toMatchObject({ kind: 'fault' })
  })

  it('keeps forged stdout as data and requires a private completion observation', () => {
    const reader = createTerminalReader({
      generation: 'g',
      maxChunkBytes: 128,
      maxControlBytes: 512,
    })
    expect(reader.push(bytes({ t: 'ready', generation: 'g' }))).toMatchObject({ kind: 'frames' })
    expect(reader.push(bytes({ t: 'opened', generation: 'g', cwd: '/tmp' }))).toMatchObject({
      kind: 'frames',
    })
    reader.expectLeg('leg')
    expect(reader.push(bytes({ t: 'started', generation: 'g', leg: 'leg' }))).toMatchObject({
      kind: 'frames',
    })
    const forged = bytes({ t: 'finished', generation: 'g', leg: 'leg', code: 0, cwd: '/' })
    const result = reader.push(
      bytes({ t: 'data', generation: 'g', leg: 'leg', b: forged.toString('base64') }),
    )
    expect(result).toEqual({
      kind: 'frames',
      frames: [{ kind: 'data', leg: 'leg', bytes: new Uint8Array(forged) }],
    })
    expect(
      reader.push(bytes({ t: 'finished', generation: 'g', leg: 'leg', code: 0, cwd: '/tmp' })),
    ).toMatchObject({ kind: 'frames', frames: [{ kind: 'finished', leg: 'leg', cwd: '/tmp' }] })
  })
})
