import { setTimeout as yieldToTimers } from 'node:timers/promises'
import { checkAppendInput } from '@omne-harness-lite/session-log'
import { attemptStartedPayload } from '@omne-harness-lite/session-runtime'
import { createHash } from 'node:crypto'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { readRegistryRecord, type AssetRegistryService } from '@omne-harness-lite/asset-registry'
import type { AssemblyManifestService } from '@omne-harness-lite/assembly-manifest'
import { jsonNumberSource, type ModelToolName } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import type { RuntimeContextOperations } from '@omne-harness-lite/runtime-context'
import {
  judgeToolDefinition,
  modelName,
  createParameterJudge,
} from '@omne-harness-lite/tool-definition'
import type { ActionOrigin, AdoptedTool } from '@omne-harness-lite/tool-admission'
import type { ToolRuntimeOperations } from '@omne-harness-lite/tool-execution-runtime'
import type { ToolActionAuthority } from './tool-action-source.ts'
import type { createToolActionDriver } from './tool-action-driver.ts'
import type { createToolDelivery } from './tool-delivery.ts'
import type { createToolDriverJournal } from './tool-driver-journal.ts'
import { driverKey } from './tool-driver-codec.ts'
import { inspectDriverEntry } from './tool-driver-codec.ts'
import { toolBatch } from './tool-batch.ts'
import { deliverDeniedAction } from './tool-denial.ts'
import { deriveCreationKey } from './call-references.ts'
import { passKeys, type LoopExtensionRunnerService } from '@omne-harness-lite/loop-extension-runner'

type Journal = Extract<
  Awaited<ReturnType<typeof createToolDriverJournal>>,
  { readonly kind: 'journal' }
>
const unavailable = { kind: 'rejected', reason: 'unavailable' } as const
const identity = (parts: readonly unknown[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex')

/** The demo owns Run progression. Tool execution and observation remain in the public registry. */
export function createToolTurnDriver(input: {
  readonly journal: Journal
  readonly authority: ToolActionAuthority
  readonly toolAccess: import('@omne-harness-lite/session-tenancy').SessionAccess
  readonly modelAccess: import('@omne-harness-lite/session-tenancy').SessionAccess
  readonly assets: AssetRegistryService
  readonly manifest: AssemblyManifestService
  readonly context: RuntimeContextOperations
  readonly runtime: ToolRuntimeOperations
  readonly actions: ReturnType<typeof createToolActionDriver>
  readonly delivery: ReturnType<typeof createToolDelivery>
  readonly runner: LoopExtensionRunnerService
  readonly now: () => Promise<string | 'unavailable'>
}) {
  async function beginRun(inboundKey: string) {
    const history = await input.journal.read(),
      at = await input.now()
    if ('unavailable' in history || at === 'unavailable') return unavailable
    const run = `tool-run-${identity([input.authority.scope, inboundKey])}`
    const existing = history.runs.get(run)
    if (existing)
      return existing.start.value.kind === 'run_started' &&
        existing.start.value.inboundKey === inboundKey
        ? ({ kind: 'started', run } as const)
        : unavailable
    const inbound = history.models.byKey.get(inboundKey)
    if (inbound?.captured.message?.type !== 'user')
      return { kind: 'rejected', reason: 'inputMissing' } as const
    const committed = await input.journal.commit({ kind: 'run_started', run, inboundKey, at })
    return committed.kind === 'committed' ? ({ kind: 'started', run } as const) : unavailable
  }
  async function beginAttempt(run: string) {
    const parameters = createParameterJudge()
    const history = await input.journal.read()
    if ('unavailable' in history) return { ...unavailable, step: 'history' }
    const current = history.runs.get(run)
    if (!current || current.end) return { kind: 'rejected', reason: 'runEnded' } as const
    // This first demo increment owns one uninterrupted attempt; resumption belongs to its later delivery.
    if (current.latest)
      return {
        kind: 'started',
        run,
        attempt: current.latest.value.attempt,
        adoption: current.latest.key,
        report: current.latest.value.report,
        tools: current.latest.value.tools.map(tool => tool.name),
      } as const
    const scope = input.authority.scope,
      attempt = 1
    const refreshed = await input.assets.refreshAvailability(
      scope.session,
      { kind: 'start', runId: run },
      attempt,
    )
    if (!('report' in refreshed)) return { ...unavailable, step: 'availability' }
    const head = await input.manifest.readHead(scope.session)
    if ('failure' in head || !head.latest.tool) return { ...unavailable, step: 'manifest' }
    const record = readRegistryRecord(head.latest.tool, scope.session, head.head)
    if (!record?.compositions.tool) return { ...unavailable, step: 'registry' }
    const tools: AdoptedTool[] = []
    for (const selected of record.compositions.tool) {
      const found = await input.assets.lookup(
        scope.session,
        'tool',
        modelName(selected.capability.name),
        { kind: 'run', report: refreshed.report },
      )
      if (
        !('entry' in found) ||
        found.entry.content.category !== 'tool' ||
        found.entry.asset !== selected.asset
      )
        return { ...unavailable, step: 'toolLookup' }
      const judged = judgeToolDefinition(found.entry.content.definition, parameters)
      if (!('ok' in judged)) return { ...unavailable, step: 'toolDefinition' }
      const definition = found.entry.content
        .definition as unknown as import('@omne-harness-lite/tool-definition').ToolDefinition
      tools.push({
        name: modelName(definition.name),
        capability: capabilityCanonicalString(selected.capability),
        asset: selected.asset,
        version: jsonNumberSource(selected.version),
        definition,
      })
    }
    const declarations = await input.context.registrations(input.authority.coordinator, scope)
    if (declarations.kind !== 'registrations')
      return { ...unavailable, step: 'contextRegistration' }
    const reader = await input.context.bind(input.modelAccess, scope, 'model')
    if (reader.kind !== 'bound') return { ...unavailable, step: 'contextBinding' }
    const adopted = await reader.reader.read(
      declarations.entries
        .filter(entry => entry.consumers.includes('model'))
        .map(entry => entry.key),
    )
    const at = await input.now()
    if (adopted.kind !== 'values' || at === 'unavailable')
      return { ...unavailable, step: 'contextRead' }
    const startedFactKey = `session-attempt:${identity([scope, run, attempt])}`
    const started = checkAppendInput(
      scope.session,
      [
        {
          tenant: scope.tenant,
          run,
          attempt,
          dedupeKey: startedFactKey,
          readKeys: ['session-runtime/attempts'],
          payload: attemptStartedPayload({
            kind: 'attempt_started',
            run,
            attempt,
            reason: 'first',
            at,
          }),
        },
      ],
      { kind: 'fenced', run, attempt },
      { kind: 'unconditional' },
    )
    if ('failure' in started) return { ...unavailable, step: 'attemptFact' }
    const startedFact = started.ok.entries[0]
    if (startedFact === undefined) return { ...unavailable, step: 'attemptFact' }
    const adoption = driverKey({
      kind: 'attempt_adopted',
      run,
      attempt,
      adoption: 'candidate',
      report: refreshed.report,
      tools,
      context: adopted.values,
      startedFactKey,
    })
    if (typeof adoption !== 'string') return { ...unavailable, step: 'adoptionKey' }
    const value = {
      kind: 'attempt_adopted' as const,
      run,
      attempt,
      adoption,
      report: refreshed.report,
      tools,
      context: adopted.values,
      startedFactKey,
    }
    const committed = await input.journal.commit(value, startedFact)
    return committed.kind === 'committed'
      ? ({
          kind: 'started',
          run,
          attempt,
          adoption: value.adoption,
          report: refreshed.report,
          tools: tools.map(tool => tool.name) as readonly ModelToolName[],
        } as const)
      : { ...unavailable, step: 'commit:' + committed.reason }
  }
  async function execute(origin: ActionOrigin, signal: AbortSignal) {
    const completed = await input.actions.dispatch(origin, signal)
    if (completed.kind !== 'complete') return completed
    const history = await input.journal.read()
    if ('unavailable' in history) return unavailable
    const reply = history.models.replies.get(origin.assistantMessage)
    if (!reply) return unavailable
    const calls = reply.message.blocks.flatMap(block =>
      block.kind === 'tool_call' && block.complete ? [block] : [],
    )
    for (const call of calls) {
      if (signal.aborted) return { kind: 'rejected', reason: 'cancelled' } as const
      const facts = history.calls.get(call.callId),
        decision = completed.completion.items.find(item => item.callId === call.callId)
      if (!facts || !decision) return unavailable
      if (decision.decision.kind === 'denied') {
        const returned = await deliverDeniedAction({
          journal: input.journal,
          runner: input.runner,
          callId: call.callId,
          signal,
        })
        if (returned.kind !== 'confirmed') return returned
        continue
      }
      // Permit due maintenance after complete-history checks. The original gate rechecks authority.
      await yieldToTimers(0)
      const submitted = await input.runtime.submit({
        access: input.toolAccess,
        scope: input.authority.scope,
        origin,
        adoption: facts.adoption.key,
        call: decision.effectiveCall,
        ...(decision.decision.kind === 'allow'
          ? {
              admissionToken: completed.admissions.find(item => item.callId === call.callId)!.token,
            }
          : {}),
      })
      if (submitted.kind !== 'recorded') return submitted
      await yieldToTimers(0)
      const acquired = await input.runtime.acquire(input.toolAccess, submitted.execution)
      if (acquired.kind !== 'acquired') return acquired
      try {
        const ended = await acquired.observer.waitForEnd()
        if (ended.kind !== 'found') return ended
      } finally {
        acquired.observer.release()
      }
      const prepared = await input.delivery.prepare(call.callId)
      if (prepared.kind !== 'ready') return prepared
      const confirmed = await input.delivery.confirm(call.callId)
      if (confirmed.kind !== 'confirmed') return confirmed
    }
    return { kind: 'returned', origin } as const
  }
  async function endRun(
    run: string,
    basis: readonly string[],
    reason: 'completed' | 'failed' = 'completed',
  ) {
    const at = await input.now()
    if (at === 'unavailable') return unavailable
    const committed = await input.journal.commit({ kind: 'run_ended', run, reason, basis, at })
    return committed.kind === 'committed' ? ({ kind: 'ended' } as const) : unavailable
  }
  async function continueModel(origin: ActionOrigin, signal: AbortSignal) {
    const parameters = createParameterJudge()
    const history = await input.journal.read()
    if ('unavailable' in history) return unavailable
    const existing = history.prefix.entries.flatMap(entry => {
      const record = inspectDriverEntry(history.prefix.scope, entry, parameters)
      return 'value' in record &&
        record.value.kind === 'continuation_requested' &&
        record.value.origin.assistantMessage === origin.assistantMessage
        ? [record.value]
        : []
    })
    if (existing[0]) return { kind: 'ready', requestKey: existing[0].requestKey } as const
    const batch = toolBatch(history, origin)
    if (!batch) return { kind: 'rejected', reason: 'actionsPending' } as const
    const dispatched = await input.runner.dispatch(
      {
        position: 'after_action',
        dimension: { scope: 'batch' },
        subject: batch.subject,
        manifest: history.prefix.scope.session,
        anchor: batch.anchor,
        run: origin.run,
        attempt: origin.attempt,
      },
      signal,
    )
    if (
      'failure' in dispatched ||
      dispatched.effect.kind !== 'proceed' ||
      dispatched.chain === undefined
    )
      return unavailable
    const keys = passKeys({
      position: 'after_action',
      dimension: { scope: 'batch' },
      anchor: batch.anchor,
    })
    if ('invalidInput' in keys) return unavailable
    const current = await input.journal.read()
    if ('unavailable' in current) return unavailable
    const requestKey = deriveCreationKey({
      session: history.prefix.scope.session,
      userMessage: origin.assistantMessage,
      run: origin.run,
      attempt: origin.attempt,
    })
    const committed = await input.journal.commit({
      kind: 'continuation_requested',
      origin,
      requestKey,
      batch: {
        pass: batch.anchor,
        chain: dispatched.chain,
        conclusions: current.prefix.entries
          .filter(entry => entry.readKeys.includes(keys.pass))
          .map(entry => entry.dedupeKey!),
      },
    })
    return committed.kind === 'committed' ? ({ kind: 'ready', requestKey } as const) : unavailable
  }
  return Object.freeze({ beginRun, beginAttempt, execute, continueModel, endRun })
}
