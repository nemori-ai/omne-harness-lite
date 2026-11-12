import { canonicalDigest, createIndependentToolScope } from '@omne-harness/tool'
import { createMemoryToolBodies, createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createCalendarToolEnvironment,
  type CalendarToolEnvironment,
} from '@omne-harness/calendar-tools'
import { createCalendarToolsPlugin } from '@omne-harness/calendar-tools/cordis'
import {
  createScheduleToolEnvironment,
  scheduleToolAdoption,
  type ScheduleToolEnvironment,
  type ScheduleToolContextRecovery,
} from '@omne-harness/schedule-tools'
import { createScheduleToolsPlugin } from '@omne-harness/schedule-tools/cordis'
import {
  createLocalToolLoader,
  createLocalTextResults,
  type LocalToolBindingsInput,
} from '@omne-harness/tool-host-local'
import {
  createLocalToolBindingsPlugin,
  createLocalToolHostPlugin,
} from '@omne-harness/tool-host-local/cordis'
import {
  ToolContributionAuthorityService,
  ToolResidencyReaderService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { createMemoryToolBindingRegistry } from '@omne-harness/tool-cordis-contract/testing'
import {
  createMemoryToolEnvironment,
  createMemoryToolStartAuthority,
  testingTenant,
} from '@omne-harness/tool-contract/testing'
import { type ToolStartRecord } from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  defaultResultPolicy,
  renderToolResult,
  type ToolFinalEnvelope,
  type ToolMessageContentBlock,
  type PreparationRecord,
} from '@omne-harness/tool-contract/provider'
import { seededWorld } from './seeded-world.ts'
import {
  absent,
  access,
  adoption,
  authorities,
  construction,
  denied,
  evidence,
  fixedRequest,
  memoryLedger,
  operationId,
  value,
} from './tool-host-values.ts'

type Environment = CalendarToolEnvironment & ScheduleToolEnvironment
export type ContextFault = 'none' | 'denied' | 'missing' | 'call' | 'tenant' | 'admission'
type OriginalContext = Extract<
  Awaited<ReturnType<ScheduleToolContextRecovery<string>['restore']>>,
  { ok: unknown }
>['ok']
type Settle = LocalToolBindingsInput<string, Environment, ToolMessageContentBlock>['settle']

export async function openToolHostWorld(
  options: { host?: boolean; world?: Awaited<ReturnType<typeof seededWorld>> } = {},
) {
  const world = options.world ?? (await seededWorld())
  const { root } = world
  const disposers: (() => Promise<void>)[] = []
  let closing: Promise<void> | undefined
  const store = createMemoryToolLedgerStore()
  const bodies = createMemoryToolBodies()
  let ledger = memoryLedger(store, bodies)
  const startAuthority = createMemoryToolStartAuthority<string>()
  const base = createMemoryToolEnvironment<string>()
  const releases = new Map<string, Parameters<typeof base.release>[0]>()
  const releasedCalls: string[] = []
  function close(): Promise<void> {
    closing ??= (async () => {
      const failures: unknown[] = []
      for (const release of releases.values()) {
        try {
          const answer = value(await base.release(release))
          if (answer.kind !== 'released') throw new Error(JSON.stringify(answer))
          releasedCalls.push(release.call)
        } catch (error) {
          failures.push(error)
        }
      }
      for (const dispose of disposers.reverse()) {
        try {
          await dispose()
        } catch (error) {
          failures.push(error)
        }
      }
      if (options.world === undefined) {
        try {
          await world.close()
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length) throw new AggregateError(failures, 'Tool host cleanup failed')
    })()
    return closing
  }
  const returned = new Map<string, unknown>()
  const loadedNames: string[] = []
  let fault: ContextFault = 'none'
  let sequence = 0
  const controlled = createMemoryToolBindingRegistry<string>(
    Object.values(authorities).map(authority => ({
      authority,
      registrants: [access('source').tenant],
    })),
  )
  class Authority extends ToolContributionAuthorityService<string> {
    readonly verify = controlled.controls.verify
    readonly admits: ToolContributionAuthorityService<string>['admits'] = input =>
      canonicalDigest(input.tenant) === canonicalDigest(access('source').tenant) &&
      input.principal === 'principal:alice'
        ? succeed(undefined)
        : fail({ kind: 'denied' })
  }
  class Residency extends ToolResidencyReaderService {
    readonly referencing: ToolResidencyReaderService['referencing'] = async () =>
      succeed({ items: [], next: null })
  }
  const originalContexts = new Map<string, OriginalContext>()
  const contexts: ScheduleToolContextRecovery<string> = {
    async restore({ access: current, recovery }) {
      const original = originalContexts.get(current.call)
      if (
        !original ||
        current.principal !== 'principal:alice' ||
        canonicalDigest(current.tenant) !== canonicalDigest(original.tenant) ||
        recovery.admission !== original.admission
      )
        return denied()
      if (fault === 'denied') return denied()
      if (fault === 'missing') return absent('schedule-context')
      return succeed({
        ...original,
        tenant:
          fault === 'tenant'
            ? testingTenant(`org_${'b'.repeat(26)}`, `acc_${'2'.repeat(26)}`)
            : current.tenant,
        call: fault === 'call' ? access('foreign').call : current.call,
        admission: fault === 'admission' ? operationId('foreign-admission') : recovery.admission,
        context: world.context,
        adapter: scheduleToolAdoption,
        source: evidence('controlled-context'),
      })
    },
  }
  const calendarEnvironment = createCalendarToolEnvironment(base, {
    resolve: async () =>
      fault === 'none'
        ? { kind: 'ok', value: world.context }
        : {
            kind: 'error',
            error: {
              code: fault === 'missing' ? 'missing_environment' : 'forbidden',
              message: 'Controlled context rejection',
              retryable: false,
              requestId: world.context.requestId,
              details: {},
            },
          },
  })
  const scheduleEnvironment = () =>
    createScheduleToolEnvironment(base, { commands: ledger.commands, contexts })
  // This world starts the binding itself, so the ledger records no start and cannot plan the final.
  // The results here stay inline: the final is the envelope as the author rendered it.
  const settle: Settle = async call => {
    const author = call.operation.author
    const text = createLocalTextResults()
    const final = (
      envelope: Pick<ToolFinalEnvelope<ToolMessageContentBlock>, 'result' | 'terminal'>,
    ) =>
      succeed({
        kind: 'final' as const,
        ...envelope,
        effect: {
          kind: 'unknown' as const,
          diagnostic: 'Inspect domain result for business effects',
        },
      })
    if (call.outcome.kind === 'failed')
      return final({
        result: value(text.text(call.outcome.reason)),
        terminal: { kind: 'failed', cause: 'executor', diagnostic: call.outcome.reason },
      })
    if (author.kind !== 'ordinary') return absent('ordinary-domain-author')
    const bytes = value(author.codec.encode(call.outcome.value))
    const checked = value(
      author.output.check({ arguments: call.arguments, value: value(author.codec.decode(bytes)) }),
    )
    returned.set(call.call, checked)
    return final({
      result: value(renderToolResult(checked, author, text, defaultResultPolicy)),
      terminal: { kind: 'completed' },
    })
  }
  const Bindings = createLocalToolBindingsPlugin<string, Environment, ToolMessageContentBlock>({
    authority: startAuthority,
    view: {
      read: async current =>
        current.principal === 'principal:alice' &&
        canonicalDigest(current.tenant) === canonicalDigest(access('source').tenant)
          ? succeed({
              scope: evidence('controlled-catalog'),
              revision: '1',
              entries: Object.values(authorities).map(authority => ({
                key: { layer: authority.layer, asset: authority.asset },
                resident: false,
              })),
            })
          : fail({ kind: 'denied', action: 'catalog.read' }),
    },
    search: { k1: 1.2, b: 0.75, maxCachedCorpora: 2 },
    availability: {
      judge: async ({ definition }) =>
        succeed({
          qualification: 'allowed',
          dependencies: definition.requiredCapabilities.map(name => ({ name, available: true })),
          inputCompatible: true,
          outputCompatible: true,
          attachmentsReadable: true,
        }),
    },
    scope: ({ execution }) =>
      value(
        createIndependentToolScope({
          signal: execution.signal,
          limits: {
            authorBufferBytes: 10000,
            authorBufferItems: 100,
            authorWaitHistoryBytes: 10000,
            authorWaitHistoryItems: 100,
          },
          process: null,
          waits: null,
        }),
      ),
    settle,
  })
  try {
    const authorityFiber = root.plugin(Authority)
    disposers.push(() => authorityFiber.dispose())
    await authorityFiber.await()
    const residencyFiber = root.plugin(Residency)
    disposers.push(() => residencyFiber.dispose())
    await residencyFiber.await()
    const bindingsFiber = root.plugin(Bindings)
    disposers.push(() => bindingsFiber.dispose())
    await bindingsFiber.await()
    if (options.host !== false) {
      const hostFiber = root.plugin(
        createLocalToolHostPlugin<string, Environment, ToolMessageContentBlock>({
          loaderFor: origin =>
            createLocalToolLoader({
              authority: origin,
              verifier: {
                verify: controlled.controls.verify,
                admits: input =>
                  input.principal === 'principal:alice'
                    ? succeed(undefined)
                    : fail({ kind: 'denied' }),
              },
              settings: async () => succeed(construction),
              schemas: async (_input, loaded) => {
                loadedNames.push(loaded.definition.name)
                return succeed(undefined)
              },
            }),
          source: {
            resolve: async () =>
              fail({
                kind: 'unavailable',
                diagnostic: 'Only explicit domain Cordis plugins are loaded in this test',
              }),
          },
          recordRejection: async () => evidence('load-rejection'),
        }),
      )
      disposers.push(() => hostFiber.dispose())
      await hostFiber.await()
    }
    if (root.get('toolGenerations') === undefined) throw new Error('Real Tool host is required')
    const inputFor = (name: 'Calendar' | 'Schedule') => ({
      access: access('author'),
      asset: {
        asset: authorities[name].asset,
        requiredCapabilities:
          name === 'Calendar' ? ['calendar.read'] : ['schedule.read', 'schedule.write'],
      },
      services: {},
    })
    const calendarPlugin = root.plugin(createCalendarToolsPlugin(inputFor('Calendar')), {
      authority: authorities.Calendar,
      construction,
      settings: adoption,
    })
    disposers.push(() => calendarPlugin.dispose())
    await calendarPlugin.await()
    const schedulePlugin = root.plugin(createScheduleToolsPlugin(inputFor('Schedule')), {
      authority: authorities.Schedule,
      construction,
      settings: adoption,
    })
    disposers.push(() => schedulePlugin.dispose())
    await schedulePlugin.await()
    const candidate = root.get('toolBindings')
    if (!(candidate instanceof Bindings)) throw new Error('Real Tool bindings are required')
    const bindings = candidate
    async function prepare(
      name: 'Calendar' | 'Schedule',
      args: unknown,
      id = `tool-call-${++sequence}`,
    ) {
      const current = access(id)
      const availability = value(
        await bindings.inspect({
          ...current,
          name,
          command: null,
          consumer: {
            capabilities: evidence('capabilities'),
            conversion: null,
            attachmentAccess: evidence('attachment-access'),
          },
        }),
      )
      if (availability.kind !== 'available') throw new Error(JSON.stringify(availability))
      const request = fixedRequest(availability, args)
      value(
        await ledger.commands.admit({ ...current, operation: operationId(`admit-${id}`), request }),
      )
      const recovery = value(await ledger.commands.loadRecovery(current))
      originalContexts.set(current.call, {
        tenant: current.tenant,
        call: current.call,
        admission: recovery.admission,
        context: world.context,
        adapter: scheduleToolAdoption,
        source: evidence(`controlled-context/${current.call}`),
      })
      const preparation: PreparationRecord = {
        tenant: current.tenant,
        call: current.call,
        operation: operationId(`prepare-${id}`),
        adoption: base.adoption,
        inputDigest: canonicalDigest(request),
        purpose: 'initial',
      }
      return { current, request, preparation, recovery }
    }
    async function environment(
      call: Awaited<ReturnType<typeof prepare>>,
      inspect = false,
    ): Promise<Environment> {
      const method = inspect ? 'inspectPreparation' : 'prepare'
      const input = { ...call.current, preparation: call.preparation, request: call.request }
      const calendar = value(await calendarEnvironment[method](input))
      const schedule = value(await scheduleEnvironment()[method](input))
      if (calendar.kind !== 'prepared' || schedule.kind !== 'prepared')
        throw new Error('Environment did not prepare')
      releases.set(call.current.call, {
        ...call.current,
        release: {
          tenant: call.current.tenant,
          call: call.current.call,
          operation: operationId(`release-${call.current.call}`),
          adoption: base.adoption,
          inputDigest: canonicalDigest(call.preparation),
          preparation: call.preparation.operation,
          resource: calendar.environment.evidence,
          custody: evidence(`lease-custody/${call.current.call}`),
        },
      })
      return { ...calendar.environment.value, ...schedule.environment.value }
    }
    async function execute(
      call: Awaited<ReturnType<typeof prepare>>,
      env = environment(call),
      attempt = 'first',
    ) {
      if (call.request.availability.kind !== 'available')
        throw new Error('Unavailable fixed request')
      const binding = value(await bindings.resolve({ ...call.current, request: call.request }))
      const start: Extract<ToolStartRecord, { kind: 'start' }> = {
        kind: 'start',
        operation: operationId(`start-${call.current.call}-${attempt}`),
        executor: call.request.availability.executor,
        execution: {
          tenant: call.current.tenant,
          call: call.current.call,
          instance: value(decodeToolInstanceId('r1-host')),
          generation: '1',
        },
      }
      const permit = value(
        await startAuthority.prepare({ ...call.current, start, request: call.request }),
      )
      const execution = value(
        await binding.start({ ...call.current, start, request: call.request, permit }, await env),
      )
      const signal = AbortSignal.timeout(10000)
      for await (const batch of execution.facts({ after: null, signal })) {
        value(
          await execution.acknowledge({
            start: start.operation,
            batch: batch.batch,
            cursor: batch.cursor,
            custody: evidence(`fact/${call.current.call}/${batch.batch}`),
          }),
        )
        for (const event of batch.events)
          if (event.fact.kind === 'final')
            return {
              returned: returned.get(call.current.call),
              output: event.fact.result,
              terminal: event.fact.terminal,
              call,
              start,
              binding,
            }
      }
      throw new Error('Execution ended without a final fact')
    }
    async function invoke(name: 'Calendar' | 'Schedule', args: unknown, id?: string) {
      return execute(await prepare(name, args, id))
    }
    return {
      ...world,
      close,
      bindings,
      loadedNames,
      releasedCalls,
      prepare,
      environment,
      execute,
      invoke,
      registeredNames: () =>
        value(bindings.snapshot(access('snapshot')))
          .map(row => row.key.asset.name)
          .sort(),
      setContextFault(next: ContextFault) {
        fault = next
      },
      rebuildLedger() {
        ledger = memoryLedger(store, bodies)
      },
      loadRecovery: (id: string) => ledger.commands.loadRecovery(access(id)),
      withdrawTools: async () => {
        await schedulePlugin.dispose()
        await calendarPlugin.dispose()
      },
      withdrawDomain: () => world.calendarProvider.dispose(),
      evidenceScope: {
        ...world.evidenceScope,
        real: [
          ...world.evidenceScope.real,
          'Tool host/bindings/loader',
          'Tool ledger',
          'Calendar/Schedule tools Cordis plugins',
        ],
        fixtures: [
          ...world.evidenceScope.fixtures,
          'Tool memory ledger store',
          'Tool origin/settings/schema sources',
          'Tool start authority',
          'Tool base environment',
          'Tool scope and context recovery source',
        ],
        notExercised: [
          ...world.evidenceScope.notExercised.filter(item => item !== 'Tool host/runtime'),
          'toolRuntime.invoke',
          'Tool ledger start records, final planning and body offloading',
          'Tool process restart durability',
          'Authorization/HITL',
          'final application deployment',
        ],
      },
    }
  } catch (error) {
    try {
      await close()
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Tool host initialization and cleanup failed')
    }
    throw error
  }
}
