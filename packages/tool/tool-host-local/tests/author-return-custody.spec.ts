import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createIndependentToolScope } from '@omne-harness/tool'
import { createLocalToolBindings } from '@omne-harness/tool-host-local'
import {
  createMemoryToolStartAuthority,
  createMemoryToolOutputCustody,
} from '@omne-harness/tool-contract/testing'
import { createRuntimeAuthorExecution } from '../src/runtime-author.ts'
import { configuration } from './runtime-composition/fixture.ts'
import { unavailableBodyWrites } from './body-writer-values.ts'
import type { ToolExecutionContext } from '@omne-harness/tool-contract/provider'
import {
  authorAccess,
  authorAuthority,
  authorModule,
  loadAuthor,
  settings,
  unbox,
} from './author-values.ts'
import { fiberedRegistry, scriptedVerifier } from './binding-values.ts'
import { callId, instanceId, operationId, request } from './coordinator-values.ts'
const limits = {
  authorBufferBytes: 4096,
  authorBufferItems: 16,
  authorWaitHistoryBytes: 65536,
  authorWaitHistoryItems: 8,
}

it.each(['receiver', 'finish-throw', 'finish-reject', 'settle-throw', 'real-settle'] as const)(
  'preserves the author return without rerunning it after %s',
  async fault => {
    let context: ToolExecutionContext
    let launches = 0
    const loaded = unbox(
      await loadAuthor(
        authorModule(async () => {
          launches += 1
          void context.emit({
            kind: 'append-text',
            index: 'progress',
            text: 'an accepted update',
            close: true,
          })
          return 'original-business-receipt'
        }),
      ),
    )
    const { registry } = fiberedRegistry(scriptedVerifier([authorAuthority]))
    unbox(registry.register({ ...authorAccess, authority: authorAuthority, loaded }))
    const fixed = request({
      availability: {
        kind: 'available',
        definition: loaded.definition,
        executor: loaded.executor,
        layer: loaded.key.layer,
      },
      settings,
    })
    const authority = createMemoryToolStartAuthority<string>()
    const outcomes: unknown[] = []
    const closings: unknown[] = []
    const custody = createMemoryToolOutputCustody<unknown>()
    let finals = 0
    const runtime = createRuntimeAuthorExecution({
      bodyWrites: unavailableBodyWrites,
      configuration,
      custody,
      finalCustody: {
        async preserveFinal() {
          finals += 1
          throw new Error('Unconfirmed closing must not publish a final')
        },
      },
    })
    const bindings = createLocalToolBindings({
      registry,
      authority,
      catalog: { inspect: async () => succeed(fixed.availability) },
      scope(input) {
        const scope = unbox(
          createIndependentToolScope({
            signal: input.execution.signal,
            limits,
            waits: null,
            process: {
              receive: async () =>
                fail({ kind: 'unavailable', operation: 'receive', reason: 'receiver unavailable' }),
            },
          }),
        )
        context = scope.context
        return scope
      },
      capability: (_input, scope) =>
        fault === 'finish-throw' || fault === 'finish-reject'
          ? {
              context: scope.context,
              limits: scope.limits,
              finish: () => {
                if (fault === 'finish-throw') throw new Error('scope threw')
                return Promise.reject(new Error('scope rejected'))
              },
            }
          : scope,
      settle: async input => {
        outcomes.push(input.outcome)
        if (fault === 'real-settle')
          return runtime.settle({
            ...input,
            operation: {
              ...input.operation,
              author: {
                ...input.operation.author,
                codec: {
                  adoption: input.operation.author.codec.adoption,
                  encode: value => succeed(new TextEncoder().encode(JSON.stringify(value))),
                  decode: bytes => succeed(JSON.parse(new TextDecoder().decode(bytes))),
                },
              },
            },
          })
        if (fault === 'settle-throw') throw new Error('settlement unavailable before custody')
        closings.push(await input.closing)
        return fail({
          kind: 'unavailable',
          dependency: 'test-settlement',
          diagnostic: 'observation only',
        })
      },
    })
    const call = callId('return-before-barrier')
    const start = {
      kind: 'start' as const,
      executor: loaded.executor,
      operation: operationId('start-return-before-barrier'),
      execution: { tenant: authorAccess.tenant, call, instance: instanceId, generation: '1' },
    }
    const input = { ...authorAccess, call, start, request: fixed }
    const binding = unbox(await bindings.resolve(input))
    const prepared = { ...input, permit: unbox(await authority.prepare(input)) }
    const live = unbox(await binding.start(prepared, {}))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(outcomes).toEqual([
      expect.objectContaining({ kind: 'returned', value: 'original-business-receipt' }),
    ])
    expect(unbox(await binding.start(prepared, {}))).toBe(live)
    expect(launches).toBe(1)
    await expect
      .poll(async () => unbox(await binding.inspectStart(input)))
      .toHaveProperty('kind', 'unknown')
    if (fault === 'real-settle') {
      const raw = unbox(
        await custody.inspect({ ...input, operation: operationId(`${start.operation}/raw`) }),
      )
      expect(raw.kind).toBe('retained')
      if (raw.kind !== 'retained') throw new Error('Original return custody missing')
      expect(JSON.parse(new TextDecoder().decode(await custody.controls.readBytes(raw.raw)))).toBe(
        'original-business-receipt',
      )
      expect(finals).toBe(0)
    } else if (fault !== 'settle-throw') {
      expect(closings).toEqual([
        expect.objectContaining({
          failure: expect.objectContaining({
            kind: fault === 'receiver' ? 'unavailable' : 'unknown',
          }),
        }),
      ])
    }
    runtime.close()
  },
)
