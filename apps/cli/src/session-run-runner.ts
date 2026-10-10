import type {
  RunnerServiceHost,
  RunnerDispatchScope,
  RunnerAnyDispatchRequest,
  RunnerTaskOwner,
  RunnerReadScope,
  RunnerImplementations,
  LoopExtensionRunnerService,
} from '@omne-harness-lite/loop-extension-runner'
import type {
  SessionAccess,
  SessionAccessOperations,
  SessionTenancyService,
} from '@omne-harness-lite/session-tenancy'
import type { SessionLogBackingOperations, LogEntryInput } from '@omne-harness-lite/session-log'
import type {
  BorrowedRunJournal,
  SessionDriverRunSources,
} from '@omne-harness-lite/session-runtime-local'
import type { SessionRunAssets, SessionRunAssetOptions } from './session-run-assets.ts'
import {
  createLoopExtensionRunner,
  readPassConclusions,
} from '@omne-harness-lite/loop-extension-runner-local'
import { createToolAdmission } from '@omne-harness-lite/tool-admission-local'
import {
  createSessionToolActionHistory,
  readSessionRunnerAction,
} from '@omne-harness-lite/session-runtime-local'

export interface SessionRunRunnerOptions {
  readonly journal: BorrowedRunJournal
  readonly assets: Pick<SessionRunAssets, 'history'>
  readonly manifest: SessionRunAssetOptions['registry']['manifest']
  readonly tenancy: SessionTenancyService
  readonly backing: SessionLogBackingOperations
  readonly access: SessionAccessOperations
  readonly toolAccess: () => SessionAccess | { readonly unavailable: true }
  readonly taskOwner: RunnerTaskOwner
  readonly admission: SessionDriverRunSources['actions']['admission']
  readonly ports: RunnerDispatchScope['ports']
  readonly readMessagePrefix: RunnerDispatchScope['readMessagePrefix']
  readonly subjectForCandidate: (
    request: RunnerAnyDispatchRequest,
    entry: LogEntryInput,
    action?: NonNullable<RunnerDispatchScope['action']>,
  ) => ReturnType<RunnerDispatchScope['subjectForCandidate']>
  readonly isActive: () => boolean
}
export interface SessionRunRunner {
  readonly runner: LoopExtensionRunnerService
  readonly host: RunnerServiceHost
  readonly admission: ReturnType<typeof createToolAdmission>
  readonly implementations: RunnerImplementations
}
export function createSessionRunRunner(requested: SessionRunRunnerOptions): {
  readonly ready: Promise<SessionRunRunner | { readonly unavailable: true }>
  readonly close: () => Promise<void>
} {
  const options = Object.freeze({
    ...requested,
    admission: Object.freeze({ ...requested.admission }),
  })
  const { journal, backing } = options
  const binding = Object.freeze({ ...journal.scope, logGeneration: backing.ownerGeneration })
  let stopped = false
  let instance: ReturnType<typeof createLoopExtensionRunner> | undefined
  let admission: ReturnType<typeof createToolAdmission> | undefined
  let withdraw: (() => void) | undefined
  let closing: Promise<void> | undefined
  const active = () =>
    !stopped &&
    journal.currentGeneration() === journal.generation &&
    backing.ownerGeneration === binding.logGeneration &&
    options.isActive()
  function scope(): RunnerReadScope {
    let released = false
    const current = () => !released && active()
    return {
      binding,
      owner: options.taskOwner,
      isActive: current,
      release() {
        released = true
      },
      sources: {
        sessionTenancy: options.tenancy,
        manifest: options.manifest,
        history: options.assets.history,
        isActive: current,
      },
    }
  }
  const host: RunnerServiceHost = {
    async acquireReplay(request) {
      if (request.manifest !== journal.scope.session || request.run !== journal.run)
        return { failure: 'invalidInput' }
      return active() ? scope() : { failure: 'unavailable' }
    },
    async acquireDispatch(request) {
      if (request.manifest !== journal.scope.session || request.run !== journal.run)
        return { failure: 'invalidInput' }
      if (!active()) return { failure: 'unavailable' }
      let action: RunnerDispatchScope['action']
      if (request.position === 'before_action') {
        const access = options.toolAccess()
        if ('unavailable' in access) return { failure: 'unavailable' }
        const read = await readSessionRunnerAction(
          {
            journal,
            ownerGeneration: binding.logGeneration,
            access,
            admission: options.admission,
          },
          request,
        )
        if ('failure' in read) return read
        action = read.action
      }
      if (!active()) return { failure: 'unavailable' }
      return {
        ...scope(),
        ...(action ? { action } : {}),
        ports: options.ports,
        readMessagePrefix: options.readMessagePrefix,
        subjectForCandidate: entry => options.subjectForCandidate(request, entry, action),
      }
    },
  }
  const ready = Promise.resolve().then((): SessionRunRunner | { readonly unavailable: true } => {
    if (!active()) return { unavailable: true }
    instance = createLoopExtensionRunner({
      log: journal.log,
      host,
      access: options.access,
      isActive: active,
    })
    admission = createToolAdmission({
      access: options.access,
      backing,
      source: instance.admissionPassSource,
      history: createSessionToolActionHistory({ readConclusions: readPassConclusions }),
    })
    const actualAdmission = admission
    withdraw = instance.implementations.registerAdmission(async (access, scope, pass, batch) => {
      const bound = await actualAdmission.forPass(access, scope, pass)
      return bound.kind === 'bound'
        ? bound.judgment.admit(batch)
        : { kind: 'failed', reason: 'unavailable' }
    })
    return Object.freeze({
      runner: instance.runner,
      host,
      admission,
      implementations: instance.implementations,
    })
  })
  const started = ready.then(
    () => undefined,
    () => undefined,
  )
  return Object.freeze({
    ready,
    close() {
      stopped = true
      instance?.closeAdmission()
      closing ??= (async () => {
        await started
        instance?.closeAdmission()
        await admission?.closeAdmission()
        await instance?.drain()
        withdraw?.()
        await admission?.close()
      })().catch(error => {
        closing = undefined
        throw error
      })
      return closing
    },
  })
}
