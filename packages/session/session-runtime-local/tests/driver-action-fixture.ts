import { vi } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
import {
  createLoopExtensionRunner,
  createRunnerTaskOwner,
} from '@omne-harness-lite/loop-extension-runner-local'
import {
  encodeRunnerAdmissionToken,
  inspectRunnerConclusion,
  type RunnerActionSource,
  type RunnerDispatchScope,
  type OfficialAdmissionContribution,
} from '@omne-harness-lite/loop-extension-runner'
import type { SessionAccess, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import {
  OFFICIAL_ADMISSION_NAME,
  type AdmissionResult,
  type AuthorizationContext,
} from '@omne-harness-lite/tool-admission'
import type { BorrowedRunJournal } from '../src/run-journal-types.ts'
import type { DriverToolBatch } from '../src/driver-tool-source.ts'
import { actionAnchor } from '../src/driver-action-facts.ts'
import { actionInitial } from '../src/driver-action-check.ts'

/** Actual Runner, registry, pass custody and original journal. Root qualifications and chain selection are controlled. */
export function driverActionFixture(journal: BorrowedRunJournal, batch: DriverToolBatch) {
  const definition = judgeDefinition({
    name: OFFICIAL_ADMISSION_NAME,
    position: 'before_action',
    power: 'veto',
    implementation: { kind: 'builtin', builtinName: OFFICIAL_ADMISSION_NAME },
  })
  if (!('ok' in definition)) throw new Error('controlled chain definition rejected')
  const selectedChain = [
    { definition: definition.ok, power: 'veto' as const, fallback: 'admission' as const },
  ]
  const grants = Object.freeze({}) as AuthorizationContext,
    heldAccess = Object.freeze({}) as SessionAccess
  const binding = { ...journal.scope, logGeneration: 'unset' }
  const authorize = vi.fn<SessionAccessOperations['authorize']>(async candidate =>
    candidate === heldAccess
      ? {
          kind: 'authorized',
          identity: {
            binding: 'controlled-runner-access',
            consumer: 'coordinator',
            principal: journal.scope.tenant.account,
            principalKind: 'human',
            scope: journal.scope,
            contextKeys: [],
          },
        }
      : { kind: 'rejected', reason: 'notAuthorized' },
  )
  const authorization: SessionAccessOperations = { authorize }
  let active = true
  const source: RunnerActionSource = {
    access: heldAccess,
    scope: journal.scope,
    run: batch.origin.run,
    attempt: batch.origin.attempt,
    assistantMessage: batch.origin.assistantMessage,
    calls: batch.calls,
    anchors: batch.calls
      .filter(call => !call.unparseable)
      .map(call => actionAnchor(batch.origin.assistantMessage, call.callId)),
    report: batch.adoption.adoption.report,
    grants,
    runMode: 'auto_permission',
    toolNames: batch.adoption.adoption.tools.map(tool => tool.name),
  }
  const unreachable = async (): Promise<never> => {
    throw new Error('unexpected unrelated source')
  }
  const makeScope = async (request: {
    readonly position: string
  }): Promise<RunnerDispatchScope> => {
    const prefix = await journal.readPrefix()
    if ('failure' in prefix) throw new Error('actual original journal unavailable')
    binding.logGeneration = prefix.source.journalGeneration
    return {
      binding,
      selectedChain: request.position === 'after_action' ? [] : selectedChain,
      owner,
      action: source,
      isActive: () => active,
      release() {},
      sources: {
        isActive: () => active,
        sessionTenancy: { holdingTenant: unreachable },
        history: { read: unreachable },
        manifest: { readHead: unreachable, dependencyPresence: async () => ({ presence: {} }) },
      },
      subjectForCandidate(entry) {
        const inspected = inspectRunnerConclusion({
          ...journal.scope,
          entry: {
            ...entry,
            payload: entry.payload as import('@omne-harness-lite/content-blocks').JsonValue,
            session: journal.scope.session,
            position: 1,
          },
        })
        if (!('conclusion' in inspected)) return { unavailable: true }
        const call = batch.calls.find(call => call.callId === inspected.conclusion.callId)
        return call ? actionInitial(batch.calls, call) : { unavailable: true }
      },
      readMessagePrefix: async () => [],
      ports: {
        readAskState: async association => ({ kind: 'pending', association }),
        openHandles: async () => ({
          log: unwrap(parseOpaqueIdentifier('controlled-action-log', 'LogHandle')),
          environment: unwrap(
            parseOpaqueIdentifier('controlled-action-environment', 'EnvironmentHandle'),
          ),
          release() {},
        }),
        verifyFailure: async () => ({ kind: 'unavailable' }),
        judgeCapabilities: async () => ({ kind: 'accepted' }),
        now: async () => '2026-10-04T00:00:00Z',
        mintReminder: () => 'controlled-action-reminder',
        fallbackNeedsProjection: async () => false,
        invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
        commandPresence: async () => 'absent',
      },
    }
  }
  // The owner reads binding when a real scope is acquired; construction below captures the actual generation first.
  let owner: ReturnType<typeof createRunnerTaskOwner>
  return {
    async open() {
      const prefix = await journal.readPrefix()
      if ('failure' in prefix) throw new Error('actual original log generation missing')
      binding.logGeneration = prefix.source.journalGeneration
      owner = createRunnerTaskOwner(binding)
      const append = vi.fn(journal.log.append)
      const instance = createLoopExtensionRunner({
        log: { ...journal.log, append },
        access: authorization,
        isActive: () => active,
        host: { acquireDispatch: makeScope, acquireReplay: makeScope },
      })
      const judge = vi.fn<OfficialAdmissionContribution>(
        async (access, scope, pass, candidates) => {
          const read = await instance.admissionPassSource.read(access, scope, pass)
          if (read.kind !== 'found') return { kind: 'failed', reason: 'unavailable' }
          const results = candidates.map((candidate, index): AdmissionResult => {
            const token = encodeRunnerAdmissionToken(candidate.call, read.record.finalKeys[index])
            if (typeof token !== 'string')
              throw new Error('actual final conclusion cannot encode locator')
            return { kind: 'allow', token }
          })
          if (!results[0]) throw new Error('unexpected empty actual candidate batch')
          return { kind: 'decisions', results: [results[0], ...results.slice(1)] }
        },
      )
      instance.implementations.registerAdmission(judge)
      return {
        instance,
        judge,
        append,
        actions: {
          runner: instance.runner,
          admission: { grants, runMode: 'auto_permission' as const },
        },
        async close() {
          active = false
          instance.closeAdmission()
          await instance.drain()
          owner.closeAdmission()
          await owner.drain()
        },
      }
    },
  }
}
