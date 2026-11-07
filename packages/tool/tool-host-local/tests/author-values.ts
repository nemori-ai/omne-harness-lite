import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { createIndependentToolScope, canonicalDigest } from '@omne-harness/tool'
import type { ToolStartRecord } from '@omne-harness/tool-contract'
import {
  defineFunctionTool,
  defineToolOperation,
  type ToolAuthority,
  type ToolExecutionFact,
  type ToolImplementationModule,
  type ToolLoader,
} from '@omne-harness/tool-contract/provider'
import type { ToolStartAuthority } from '@omne-harness/tool-contract/provider'
import {
  completedFinal,
  createMemoryToolStartAuthority,
  type ToolExecutorBindingFixture,
} from '@omne-harness/tool-contract/testing'
import {
  createLocalToolLoader,
  createLocalToolBindings,
  type LocalAuthorExecution,
} from '@omne-harness/tool-host-local'
import {
  accessOf,
  authorityFor,
  fiberedRegistry,
  scriptedVerifier,
  tenantA,
  tenantB,
} from './binding-values.ts'
import { adoption, request } from './coordinator-values.ts'

export const unbox = <T>(result: Outcome<T, unknown>): T => {
  if ('failure' in result) throw new Error(JSON.stringify(result.failure))
  return result.ok
}
export const construction = { kind: 'object', entries: [] } as const
export const settings = adoption('author-settings')
export const authorAccess = accessOf(tenantA)
export const authorAuthority = authorityFor({ kind: 'official' }, 'read_file')
export function authorModule(
  execute: (signal: AbortSignal) => Promise<unknown>,
  /** The parameter result of the author; parsed by default. */
  parsed: () => Outcome<
    unknown,
    Readonly<{ kind: 'incomplete' | 'invalid'; reason: string }>
  > = () => succeed({}),
): ToolImplementationModule<unknown, ContentBlock> {
  return {
    executor: { ...adoption('executor'), owner: 'conformance' },
    createAuthor() {
      const definition = request().availability.definition
      if (definition.kind !== 'function') throw new Error('function fixture')
      const operation = defineToolOperation({
        parameters: { kind: 'declared', value: definition.parameters },
        returns: ordinaryReturnFixture(adoption('codec')),
        author: {
          kind: 'ordinary',
          parameters: { adoption: adoption('parameters'), parse: parsed },
          waits: [],
          executor: { execute: (_args, _environment, context) => execute(context.signal) },
          codec: {
            adoption: adoption('codec'),
            encode: () => succeed(new Uint8Array()),
            decode: () => succeed({}),
          },
          output: { adoption: adoption('output'), check: ({ value }) => succeed(value) },
          renderer: { render: () => succeed('done') },
          program: { kind: 'none' },
        },
      })
      if ('failure' in operation) return operation
      return defineFunctionTool({
        operation: operation.ok,
        implementation: {
          description: 'A real test author',
          backgroundAllowed: false,
          declarations: definition.declarations,
        },
      })
    },
  }
}
export function authorLoader(
  authority: ToolAuthority = authorAuthority,
): ToolLoader<string, unknown, ContentBlock> {
  return createLocalToolLoader({
    authority,
    verifier: scriptedVerifier([authority]),
    settings: async () => succeed(construction),
    schemas: async () => succeed(undefined),
  })
}
export const loadAuthor = (
  module: ToolImplementationModule<unknown, ContentBlock>,
  authority = authorAuthority,
) =>
  authorLoader(authority).load({
    ...authorAccess,
    asset: { asset: authority.asset, requiredCapabilities: [] },
    settings,
    module,
    services: {},
  })

type Final = Extract<ToolExecutionFact<ContentBlock>, { kind: 'final' }>
export async function bindingFixture(
  consume?: ToolStartAuthority<string>['consume'],
): Promise<ToolExecutorBindingFixture<string, unknown> & Readonly<{ pins(): string }>> {
  let launches = 0
  const actors = new Map<string, LocalAuthorExecution<ContentBlock>>()
  const completes = new Map<AbortSignal, (value: Final) => void>()
  const results = new Map<AbortSignal, Final>()
  const held = new Set<AbortSignal>()
  const key = (start: ToolStartRecord) => canonicalDigest(start)
  const actor = (start: ToolStartRecord) => {
    const found = actors.get(key(start))
    if (found === undefined) throw new Error('missing live author')
    return found
  }
  const finish = async (start: ToolStartRecord, final: Final) => {
    const execution = actor(start)
    results.set(execution.signal, final)
    completes.get(execution.signal)?.(final)
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  const module = authorModule(signal => {
    launches += 1
    return new Promise<Final>(resolve => {
      completes.set(signal, resolve)
      signal.addEventListener(
        'abort',
        () => {
          if (!held.has(signal)) {
            const final = completedFinal()
            results.set(signal, final)
            resolve(final)
          }
        },
        { once: true },
      )
    })
  })
  const loaded = unbox(await loadAuthor(module))
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
  const memoryAuthority = createMemoryToolStartAuthority<string>()
  const authority = { ...memoryAuthority, consume: consume ?? memoryAuthority.consume }
  const permits = new Map<string, ReturnType<typeof authority.prepare>>()
  const bindings = createLocalToolBindings({
    registry,
    authority,
    catalog: { inspect: async () => succeed(fixed.availability) },
    scope(input) {
      actors.set(key(input.start), input.execution)
      return unbox(
        createIndependentToolScope({
          signal: input.execution.signal,
          limits: {
            authorBufferBytes: 10000,
            authorBufferItems: 100,
            authorWaitHistoryBytes: 10000,
            authorWaitHistoryItems: 100,
          },
          process: null,
          waits: null,
        }),
      )
    },
    settle: async input => {
      const final = results.get(input.execution.signal)
      return final === undefined
        ? fail({ kind: 'unavailable', dependency: 'test-result', diagnostic: 'missing final' })
        : succeed(final)
    },
  })
  const binding = unbox(
    await bindings.resolve({
      ...authorAccess,
      call: unbox((await import('@omne-harness/tool-contract')).decodeToolCallId('call-1')),
      request: fixed,
    }),
  )
  if (binding.kind !== 'live-only') throw new Error('expected live binding')
  return {
    binding,
    pins: () => unbox(registry.pins(loaded.key)),
    access: authorAccess,
    otherAccess: accessOf(tenantB),
    environment: {},
    request: fixed,
    permit: async start => {
      let pending = permits.get(key(start))
      if (pending === undefined) {
        pending = authority.prepare({
          principal: 'user',
          tenant: start.execution.tenant,
          call: start.execution.call,
          start,
          request: fixed,
        })
        permits.set(key(start), pending)
      }
      return unbox(await pending)
    },
    launches: () => launches,
    emit: async (start, fact) => {
      actor(start).publish(fact)
    },
    finish,
    loseContinuity: async start => {
      actor(start).lose(completedFinal().raw.custody)
    },
    blindInspection: start => {
      actor(start).observationAvailable(false)
    },
    pendingAcknowledgements: start => actor(start).pendingAcknowledgements(),
    holdStop: start => {
      held.add(actor(start).signal)
    },
    completeStop: start => finish(start, completedFinal()),
    settle: async () => {},
  }
}
