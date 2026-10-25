import { fail, succeed } from '@omne-harness/operation-result'
import {
  createIndependentToolScope,
  createToolRuntime,
  createTools,
  executeTool,
  type AccessVerdict,
  type ToolConfiguration,
  type Tools,
} from '@omne-harness/tool'
import {
  createTestInvocationSource,
  createTestToolDependencies,
  createTestToolIdentities,
  type TestToolDependencies,
} from '@omne-harness/tool/testing'
import {
  type Access,
  type ToolCallId,
  type ToolExecutionRef,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import { type ToolHandle } from '@omne-harness/tool-contract/provider'
import {
  defaultResultPolicy,
  type ToolDriver,
  type ToolInstanceHost,
} from '@omne-harness/tool-contract/provider'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import {
  adoption,
  argumentLimits,
  createReportTool,
  evidence,
  textResult,
  valueOf,
} from '../examples/report-tool.ts'

export const configuration: ToolConfiguration = {
  authorBufferBytes: 65_536,
  authorBufferItems: 64,
  authorWaitHistoryBytes: 65_536,
  authorWaitHistoryItems: 64,
  processBatchBytes: 8_192,
  processBatchDelayMs: 1,
  observerBufferBytes: 65_536,
  resultPageBytes: 4_096,
  reconciliationDelayMs: 1,
  ledgerCommitAttempts: 8,
  queueCapacity: 16,
  driverStepsPerRun: 32,
}

export function createDemo() {
  // Legal tenant construction is real. Membership and source issuance below are test providers.
  const tenant = testingTenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`)
  const access: Access<string> = { principal: 'tutorial-reader', tenant }
  const qualify = (input: Access<string>): AccessVerdict =>
    input.principal === access.principal && input.tenant === tenant
      ? { kind: 'allowed' }
      : { kind: 'denied', reason: 'Unknown tutorial principal or tenant' }
  const scopeGrant = evidence('slot-grant', access)
  const identities = createTestToolIdentities()
  const source = createTestInvocationSource<string>({
    snapshotPrincipal: principal => principal,
    authority: {
      qualify: async input => qualify(input),
      samePrincipal: async input =>
        input.current === input.original
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'Principal changed' },
    },
  })
  const report = createReportTool()
  let registeredTools: Tools<string> | undefined
  let driver: ToolDriver<string> | null = null
  const scheduled = new Set<ToolCallId>()
  const instances = new Map<ToolCallId, Awaited<ReturnType<typeof instanceFor>>>()
  const signals = new Map<ToolCallId, AbortController>()
  const publications = new Map<
    string,
    { execution: ToolExecutionRef; handle: ToolHandle<string> }
  >()
  const readers = new Set<Promise<void>>()
  const readerErrors: unknown[] = []
  let removeDriver = async () => {}
  let closed = false
  const capsules = new Map<string, unknown>()
  let startCalls = 0
  let preparations = 0
  const instanceFor = async () => valueOf(await identities.instanceIdentities.newInstance())
  const host: ToolInstanceHost<string> = {
    install: installed => {
      driver = installed
      removeDriver = async () => {
        driver = null
      }
      return { release: removeDriver }
    },
    // Scheduling records work only. advance runs it under the same instance and signal.
    schedule: async input => {
      if (closed)
        return fail({ kind: 'unavailable', dependency: 'tutorial-host', diagnostic: 'closed' })
      scheduled.add(input.call)
      return succeed({ queued: true })
    },
    publish: async (execution, handle) => {
      const registration = `publication-${execution.call}`
      publications.set(registration, { execution, handle })
      return succeed({ execution, registration })
    },
    withdraw: async input => succeed({ removed: publications.delete(input.registration) }),
    directory: {
      connect: async input => {
        const found = [...publications.values()].find(item => item.execution.call === input.call)
        return succeed(
          found === undefined ? { kind: 'no-live-route' } : { kind: 'live', handle: found.handle },
        )
      },
    },
  }
  const test: TestToolDependencies<string> = createTestToolDependencies<string>({
    configuration,
    operationIdentities: identities.operationIdentities,
    sourceIssuer: source.issuer,
    instances: host,
    guards: {
      access: { qualify: async input => qualify(input) },
      sources: source.guard,
      grants: new Map([
        [
          'tool-tutorial',
          {
            verifyGrant: async input =>
              qualify(input).kind === 'allowed' &&
              input.scope.owner === 'tool-tutorial' &&
              input.scope.key === 'tutorial-slot' &&
              input.scope.grant.owner === scopeGrant.owner &&
              input.scope.grant.record === scopeGrant.record &&
              input.scope.grant.revision === scopeGrant.revision &&
              input.scope.grant.digest === scopeGrant.digest
                ? { kind: 'granted' }
                : { kind: 'refused', reason: 'Unknown scope grant' },
          },
        ],
      ]),
      starts: {
        qualifyStart: async input =>
          qualify(input).kind === 'allowed'
            ? { kind: 'allowed' }
            : { kind: 'refused', reason: 'Current qualification denied' },
      },
      results: { text: value => succeed(textResult([value])) },
      policy: defaultResultPolicy,
      budgets: { arguments: argumentLimits },
    },
    catalog: {
      inspect: async () =>
        fail({
          kind: 'unsupported',
          adoption: adoption('catalog'),
          reason: 'Tutorial supplies fixed definitions',
        }),
      usage: async () =>
        fail({
          kind: 'unsupported',
          adoption: adoption('catalog'),
          reason: 'Use actual Tools.help',
        }),
      search: async () =>
        fail({
          kind: 'unsupported',
          adoption: adoption('catalog'),
          reason: 'No search in this tutorial',
        }),
    },
    children: {
      reserve: async () => {
        throw new Error('No child calls in this tutorial')
      },
      admitted: async () => {
        throw new Error('No child calls in this tutorial')
      },
      retain: async () => {
        throw new Error('No child calls in this tutorial')
      },
      list: async () => {
        throw new Error('No child calls in this tutorial')
      },
      close: async () => {
        throw new Error('No child calls in this tutorial')
      },
      closure: async () => {
        throw new Error('No child calls in this tutorial')
      },
      confirmBarrier: async () => {
        throw new Error('No child calls in this tutorial')
      },
      finish: async () => {
        throw new Error('No child calls in this tutorial')
      },
    },
    bindingsFor: executor => ({
      inspect: async () =>
        fail({
          kind: 'unsupported',
          adoption: adoption('binding'),
          reason: 'Fixed registrations only',
        }),
      recover: async input => {
        const inspected = await executor.inspectStart(input)
        if ('failure' in inspected) return inspected
        if (inspected.ok.kind !== 'live')
          return fail({
            kind: 'unavailable',
            dependency: 'tutorial-binding',
            diagnostic: 'No live recovery route',
          })
        return succeed({
          ...inspected.ok.execution,
          inspectStart: start => executor.inspectStart({ ...input, start }),
          inspectSuspension: async () =>
            fail({ kind: 'unsupported', adoption: adoption('binding'), reason: 'No suspension' }),
        })
      },
      resolve: async () =>
        succeed({
          ...executor,
          start: async (input, _environment) => {
            startCalls += 1
            // Stage the exact launch intent before consuming the permit. The receipt refers to this capsule.
            const capsule = `capsule-${input.start.operation}`
            capsules.set(capsule, { request: input.request, start: input.start })
            const consumed = await test.doubles.authority.consume({
              ...access,
              call: input.call,
              permit: input.permit,
              executorReceipt: evidence(capsule, capsules.get(capsule)),
            })
            if ('failure' in consumed) return consumed
            if (consumed.ok.kind !== 'started')
              return fail({
                kind: 'unavailable',
                dependency: 'tutorial-binding',
                diagnostic: `Start not confirmed: ${consumed.ok.kind}`,
              })
            const live = await executor.start(input, _environment)
            if ('failure' in live) return live
            const registration = readToolRegistration(
              input.request.command === null
                ? report.implementation
                : registeredTools?.implementation,
            )
            if (registration === undefined) throw new Error('Missing registered author')
            const operation =
              registration.kind === 'function'
                ? registration.operation
                : registration.operations.find(([name]) => name === input.request.command)?.[1]
            if (operation === undefined) throw new Error('Unknown command')
            const author = operation.author
            const argumentsValue = valueOf(author.parameters.parse(input.request.arguments))
            const executionSignal = signals.get(input.call)?.signal
            if (executionSignal === undefined)
              throw new Error('Host did not register the original execution signal')
            const scope = valueOf(
              createIndependentToolScope({
                limits: {
                  authorBufferBytes: configuration.authorBufferBytes,
                  authorBufferItems: configuration.authorBufferItems,
                  authorWaitHistoryBytes: configuration.authorWaitHistoryBytes,
                  authorWaitHistoryItems: configuration.authorWaitHistoryItems,
                },
                signal: executionSignal,
                process: null,
                waits: null,
              }),
            )
            // The trusted binding can read the registration. Ordinary consumers cannot.
            const value = valueOf(await executeTool(argumentsValue, author.executor, access, scope))
            const result =
              author.kind === 'ordinary'
                ? textResult(
                    valueOf(
                      author.renderer.render(
                        valueOf(author.output.check({ arguments: argumentsValue, value })),
                      ),
                    ).split('\n\n'),
                  )
                : valueOf(
                    defaultResultPolicy.judgeResult(
                      valueOf(author.output.check({ arguments: argumentsValue, value })),
                    ),
                  )
            const bytes = valueOf(author.codec.encode(value))
            const raw = valueOf(
              await test.doubles.custody.preserve({
                ...access,
                call: input.call,
                operation: valueOf(await identities.operationIdentities.newOperation()),
                codec: author.codec.adoption,
                bytes,
                source: evidence(`author-output-${input.call}`, { bytes: bytes.length }),
              }),
            )
            // Publish the actual author's result as the source's final fact. Never seed ledger state.
            await test.doubles.executor.controls.finish(input.start, {
              kind: 'final',
              raw,
              result,
              terminal: { kind: 'completed' },
              effect: { kind: 'not-occurred', evidence: evidence('read-only-report', input.call) },
            })
            return succeed({
              ...live.ok,
              facts: async function* (input) {
                const ended = Promise.withResolvers<void>()
                readers.add(ended.promise)
                try {
                  yield* live.ok.facts(input)
                } catch (error: unknown) {
                  readerErrors.push(error)
                  throw error
                } finally {
                  ended.resolve()
                  readers.delete(ended.promise)
                }
              },
            })
          },
        }),
    }),
  })
  const provider = createToolRuntime(
    {
      ...test.dependencies,
      environments: {
        ...test.dependencies.environments,
        prepare: input => {
          preparations += 1
          return test.dependencies.environments.prepare(input)
        },
      },
    },
    configuration,
  )
  const tools = createTools<string>(
    {
      queries: {
        readResult: async input => {
          const reply = await provider.runtime.queries.readResult(input)
          return 'failure' in reply
            ? reply
            : succeed({
                ...reply.ok,
                value: valueOf(defaultResultPolicy.judgeResult(reply.ok.value)),
              })
        },
      },
      content: provider.runtime.content,
    },
    {
      arguments: argumentLimits,
      resultPageBytes: configuration.resultPageBytes,
      replyMaxBytes: 65_536,
      contentPageBytes: 1_024,
    },
  )
  registeredTools = tools
  const request = (
    position: string,
    command: string | null,
    argumentsText: string,
  ): ToolInvokeRequest => ({
    availability: {
      kind: 'available',
      definition: command === null ? report.definition : tools.definition,
      executor: adoption(command === null ? 'report-executor' : 'Tools-executor'),
      layer: { kind: 'official' },
    },
    command,
    arguments: { original: argumentsText, effective: argumentsText, complete: true },
    settings: adoption('settings'),
    context: adoption('context'),
    workspace: null,
    environment: adoption('environment'),
    resources: [],
    scope: { owner: 'tool-tutorial', key: 'tutorial-slot', grant: scopeGrant },
    consumer: {
      owner: 'tutorial-consumer',
      work: 'report-journey',
      position,
      purpose: 'read-result',
    },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
  })
  return {
    access,
    runtime: provider.runtime,
    tools,
    report,
    test,
    identities,
    request,
    counts: () => ({ preparations, startCalls, executions: report.executions() }),
    async advance() {
      if (closed || driver === null) throw new Error('Tutorial host is closed')
      const calls = [...scheduled]
      scheduled.clear()
      for (const call of calls) {
        let instance = instances.get(call)
        if (instance === undefined) {
          instance = await instanceFor()
          instances.set(call, instance)
        }
        let controller = signals.get(call)
        if (controller === undefined) {
          controller = new AbortController()
          signals.set(call, controller)
        }
        await driver.run({ ...access, call, instance, signal: controller.signal })
      }
      // Let source.next continuations enqueue their work. No elapsed-time business clock.
      await Promise.resolve()
      return scheduled.size
    },
    async close() {
      closed = true
      for (const controller of signals.values()) controller.abort()
      const errors: unknown[] = []
      const ended = await Promise.allSettled(readers)
      errors.push(...readerErrors)
      for (const result of ended) if (result.status === 'rejected') errors.push(result.reason)
      for (const [registration, publication] of publications) {
        try {
          valueOf(await host.withdraw({ execution: publication.execution, registration }))
        } catch (error: unknown) {
          errors.push(error)
        }
      }
      try {
        await removeDriver()
      } catch (error: unknown) {
        errors.push(error)
      }
      scheduled.clear()
      if (errors.length > 0) throw new AggregateError(errors, 'Tutorial host cleanup failed')
    },
  }
}

export type Demo = ReturnType<typeof createDemo>
