import { randomUUID } from 'node:crypto'
import {createRunnerTaskOwner, createRunnerLogAdapter, createRunnerReminderLogAdapter, runPass} from '@omne-harness-lite/loop-extension-runner-local'
import { type RunnerPass, type RunnerPiece, type RunnerPorts, type RunnerPassResult, type RunnerLogBinding, type RunnerTaskOwner, type RunnerRecoveryResult } from '@omne-harness-lite/loop-extension-runner'
import {readSettlementPrefix, type SettlementLogBinding, type SettlementRegistration} from '@omne-harness-lite/model-request-runtime-local'
import {
  openJsonlSessionLog,
  type JsonlSessionLog,
  type SessionLogOptions,
} from '@omne-harness-lite/session-log-jsonl'
import { tenantIdEquals, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { messagePrefix } from './model-request-text.ts'

/** Explicit development-host sources; these do not certify Run or waiting-owner facts. */
export interface DemoRunnerRequest {
  readonly pass: RunnerPass
  readonly chain: readonly RunnerPiece[]
  readonly ports: Omit<RunnerPorts, 'binding' | 'readConclusions' | 'record' | 'reminders'> & {
    readonly reminders: Pick<RunnerPorts['reminders'], 'nestedChain'>
  }
  readonly subjectForCandidate: Parameters<typeof createRunnerLogAdapter>[0]['subjectForCandidate']
  readonly signal?: AbortSignal
}

export interface DemoRunnerCloseResult {
  readonly complete: boolean
  readonly recovered: readonly RunnerRecoveryResult[]
}

/** One physical JSONL host retains every runner task, including lost append receipts. */
export function createDemoRunnerHost(log: JsonlSessionLog, deployment: SessionLogOptions) {
  const recoveryDeployment: SessionLogOptions = {
    ...deployment,
    processOwnership: {
      current: deployment.processOwnership.current,
      observeExit: deployment.processOwnership.observeExit.bind(deployment.processOwnership),
      ...(deployment.processOwnership.observeLegacyExit === undefined
        ? {}
        : {
            observeLegacyExit: deployment.processOwnership.observeLegacyExit.bind(
              deployment.processOwnership,
            ),
          }),
    },
    ...(deployment.policy === undefined ? {} : { policy: { ...deployment.policy } }),
  }
  const generation = randomUUID()
  const sessions = new Map<string, { binding: RunnerLogBinding; owner: RunnerTaskOwner }>()
  const controller = new AbortController()
  const passes = new Set<Promise<unknown>>()
  const invocations = new Set<Promise<unknown>>()
  let admitting = true
  let closing: Promise<DemoRunnerCloseResult> | undefined
  let finished: DemoRunnerCloseResult | undefined
  let recoveryReader: JsonlSessionLog | undefined
  const recovered: RunnerRecoveryResult[] = []

  function closeAdmission() {
    admitting = false
    controller.abort()
    for (const { owner } of sessions.values()) owner.closeAdmission()
  }

  function borrow(binding: SettlementLogBinding) {
    if (!admitting || binding.log !== log || binding.currentGeneration() !== binding.generation)
      return { unavailable: true } as const
    let session = sessions.get(binding.session)
    if (session !== undefined && !tenantIdEquals(session.binding.tenant, binding.tenant))
      return { unavailable: true } as const
    if (session === undefined) {
      const ownedBinding: RunnerLogBinding = Object.freeze({
        session: binding.session,
        tenant: binding.tenant,
        logGeneration: generation,
      })
      session = { binding: ownedBinding, owner: createRunnerTaskOwner(ownedBinding) }
      sessions.set(binding.session, session)
    }
    return Object.freeze({
      binding: session.binding,
      owner: session.owner,
      isActive: () =>
        admitting &&
        binding.log === log &&
        binding.currentGeneration() === binding.generation &&
        sessions.get(binding.session) === session,
    })
  }

  function run(
    binding: SettlementLogBinding,
    request: DemoRunnerRequest,
  ): Promise<RunnerPassResult> {
    const existing = sessions.get(binding.session)
    if (existing !== undefined && !tenantIdEquals(existing.binding.tenant, binding.tenant))
      return Promise.resolve({ failure: 'invalidInput' })
    const borrowed = borrow(binding)
    if ('unavailable' in borrowed) return Promise.resolve({ failure: 'unavailable' })
    const { owner, binding: runnerBinding } = borrowed
    const signal =
      request.signal === undefined
        ? controller.signal
        : AbortSignal.any([controller.signal, request.signal])
    const registration: SettlementRegistration = {
      start(kind, execute) {
        if (kind !== 'read') throw new Error('Runner message prefix registration is read-only')
        const started = owner.start({ kind: 'read', execute: () => execute(signal) })
        if ('unavailable' in started) throw new Error('Runner admission closed')
        return {
          completion: started.completion,
          stopped: started.completion.then(
            () => undefined,
            () => undefined,
          ),
          requestStop() {},
        }
      },
      release() {}, // The enclosing runner owner retains all physical tasks.
    }
    const adapter = createRunnerLogAdapter({
      log,
      binding: runnerBinding,
      owner,
      subjectForCandidate: request.subjectForCandidate,
    })
    const reminders = createRunnerReminderLogAdapter({
      log,
      binding: runnerBinding,
      owner,
      async readMessagePrefix() {
        const prefix = await readSettlementPrefix({ binding, registration })
        if ('unavailable' in prefix) return { unavailable: true }
        const decoded = messagePrefix(prefix.prefix)
        return 'unavailable' in decoded ? decoded : decoded.messages
      },
    })
    const task = runPass(
      request.pass,
      request.chain,
      {
        ...request.ports,
        ...adapter,
        isActive: () =>
          admitting &&
          binding.currentGeneration() === binding.generation &&
          request.ports.isActive(),
        invoke(...args) {
          const invocation = Promise.resolve().then(() =>
            signal.aborted
              ? { kind: 'controlUnavailable' as const }
              : request.ports.invoke(...args),
          )
          invocations.add(invocation)
          void invocation.then(
            () => invocations.delete(invocation),
            () => invocations.delete(invocation),
          )
          return invocation
        },
        reminders: { ...reminders, nestedChain: request.ports.reminders.nestedChain },
      },
      signal,
    )
    passes.add(task)
    void task.then(
      () => passes.delete(task),
      () => passes.delete(task),
    )
    return task
  }

  function close(): Promise<DemoRunnerCloseResult> {
    closeAdmission()
    if (finished !== undefined) return Promise.resolve(finished)
    if (closing !== undefined) return closing
    const task = (async (): Promise<DemoRunnerCloseResult> => {
      if (recoveryReader !== undefined) {
        try {
          await recoveryReader.close()
          recoveryReader = undefined
        } catch {
          return { complete: false, recovered: [...recovered] }
        }
      }
      await Promise.allSettled([...passes])
      await Promise.allSettled([...invocations])
      // Physical stop precedes unknown drain. Waiting for drain first deadlocks recovery.
      try {
        await log.close()
      } catch {
        return { complete: false, recovered: [...recovered] }
      }
      let reader: JsonlSessionLog | undefined
      try {
        if ([...sessions.values()].some(item => item.owner.hasUnknown(item.binding))) {
          // SL3/D085 admission validates the actual marker and old process ownership.
          reader = await openJsonlSessionLog(recoveryDeployment)
          recoveryReader = reader
          for (const { owner, binding } of sessions.values()) {
            if (!owner.hasUnknown(binding)) continue
            const parsed = parseOpaqueIdentifier(binding.session, 'SessionRef')
            if (!('ok' in parsed)) return { complete: false, recovered: [...recovered] }
            const source = reader
            const result = await owner.reconcileStoppedLog({
              binding,
              async readByKey(key) {
                const read = await source.readByKey(parsed.ok, key)
                return 'entries' in read ? read.entries : { unavailable: true }
              },
            })
            if ('unavailable' in result) return { complete: false, recovered: [...recovered] }
            recovered.push(...result)
            if (result.some(item => item.kind === 'unavailable'))
              return { complete: false, recovered: [...recovered] }
          }
        }
        await Promise.all([...sessions.values()].map(item => item.owner.drain()))
      } catch {
        return { complete: false, recovered: [...recovered] }
      } finally {
        if (reader !== undefined) {
          try {
            await reader.close()
            recoveryReader = undefined
          } catch {
            // Retain the actual recovery reader; a failed close cannot release its ownership.
            return { complete: false, recovered: [...recovered] }
          }
        }
      }
      finished = { complete: true, recovered: Object.freeze([...recovered]) }
      return finished
    })()
    closing = task
    void task.then(
      () => {
        closing = undefined
      },
      () => {
        closing = undefined
      },
    )
    return task
  }
  return Object.freeze({ run, borrow, closeAdmission, close })
}
