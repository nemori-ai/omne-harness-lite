import { checkKey } from '@omne-harness-lite/session-log'
import type { LocalSessionDriverOptions } from './driver-types.ts'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { SessionLifecycleStep, StepCommit } from '@omne-harness-lite/session-runtime'

type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
type ModelIdentities = ReturnType<LocalSessionDriverOptions['identities']['model']>
type Committed = Extract<StepCommit, { kind: 'committed' }>
type Inputs = Pick<LocalSessionDriverOptions, 'ingress' | 'identities'>
type OriginalStep = { readonly step: SessionLifecycleStep; readonly result: StepCommit }
type Blocked = {
  readonly kind: 'blocked'
  readonly reason: unknown
  readonly originals: readonly OriginalStep[]
}
export type DriverRunStart =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'prepared'
      readonly preparation: Preparation
      readonly identities: ModelIdentities
      readonly source: Committed['source']
    }
  | Blocked

export async function startDriverRun(
  options: Inputs,
  scope: SessionScope,
  isOpen: () => boolean,
): Promise<DriverRunStart> {
  return new RunStart(options, scope, isOpen).start()
}

class RunStart {
  readonly originals: OriginalStep[] = []
  constructor(
    readonly options: Inputs,
    readonly scope: SessionScope,
    readonly isOpen: () => boolean,
  ) {}
  blocked(reason: unknown): Blocked {
    return Object.freeze({ kind: 'blocked', reason, originals: Object.freeze([...this.originals]) })
  }
  async commit(step: SessionLifecycleStep, source: Committed['source']) {
    if (!this.isOpen()) return this.blocked('withdrawn')
    const ingress = this.options.ingress
    const result = await ingress.lifecycle.commitStep(
      ingress.coordinationAuthority,
      this.scope,
      source,
      step,
    )
    this.originals.push(Object.freeze({ step, result }))
    return 'kind' in result && result.kind === 'committed' ? result : this.blocked(result)
  }
  async pending() {
    if (!this.isOpen()) return this.blocked('withdrawn')
    const ingress = this.options.ingress
    const work = await ingress.readWork(ingress.coordinationAuthority, this.scope, 1)
    if (!('kind' in work)) return this.blocked(work)
    if (!this.isOpen()) return this.blocked('withdrawn')
    if (work.head.lifecycle !== 'active') return this.blocked('inactive')
    if (work.head.run?.state === 'runnable' || work.head.run?.state === 'waiting')
      return this.resume(work.source)
    const input = work.inputs[0]
    if (input === undefined) return { kind: 'idle' as const }
    return { kind: 'input' as const, input, source: work.source }
  }
  async resume(source: Committed['source']): Promise<DriverRunStart> {
    const { ingress } = this.options
    const recovered = await ingress.resumePreparedCall(
      ingress.coordinationAuthority,
      this.scope,
      source,
    )
    if (!('kind' in recovered)) return this.blocked(recovered)
    if (!this.isOpen()) return this.blocked('withdrawn')
    const { preparation, identityBasis } = recovered
    const restored = this.options.identities.restoreModel?.(preparation)
    const candidate =
      restored ??
      (identityBasis.kind === 'predecessor'
        ? this.options.identities.model(
            this.scope,
            preparation.run,
            preparation.attempt,
            identityBasis.position,
          )
        : { unavailable: true as const })
    if ('unavailable' in candidate) return this.blocked('originalModelIdentityUnavailable')
    const identities = Object.freeze({ ...candidate })
    if (
      !Object.values(identities).every(checkKey) ||
      identities.prepareKey !== preparation.stepKey ||
      identities.call !== preparation.call ||
      identities.originalPosition !== preparation.originalPosition
    )
      return this.blocked('originalModelIdentityMismatch')
    return Object.freeze({ kind: 'prepared', preparation, identities, source: recovered.source })
  }
  async start(): Promise<DriverRunStart> {
    const pending = await this.pending()
    if (pending.kind !== 'input') return pending
    const keys = Object.freeze({ ...this.options.identities.run(this.scope, pending.input) })
    if (!checkKey(keys.startKey) || !checkKey(keys.attemptKey))
      throw new TypeError('stable original Run identities required')
    const run = await this.commit(
      Object.freeze({
        kind: 'startRun',
        stepKey: keys.startKey,
        inputPosition: pending.input,
      }),
      pending.source,
    )
    if (run.kind === 'blocked') return run
    if (!run.receipt.run) throw new TypeError('committed original Run receipt required')
    const attempt = await this.commit(
      Object.freeze({
        kind: 'startAttempt',
        stepKey: keys.attemptKey,
        run: run.receipt.run,
        reason: 'first',
      }),
      run.source,
    )
    if (attempt.kind === 'blocked') return attempt
    return this.prepare(attempt)
  }
  async prepare(attempt: Committed): Promise<DriverRunStart> {
    if (!this.isOpen()) return this.blocked('withdrawn')
    const { run, attempt: sequence, position } = attempt.receipt
    if (!run || sequence === null || !attempt.permit)
      return this.blocked('originalPermitUnavailable')
    const identities = Object.freeze({
      ...this.options.identities.model(this.scope, run, sequence, position),
    })
    if (!Object.values(identities).every(checkKey))
      throw new TypeError('stable original model identities required')
    const preparation: Preparation = Object.freeze({
      kind: 'prepareCall',
      stepKey: identities.prepareKey,
      run,
      attempt: sequence,
      permit: attempt.permit,
      call: identities.call,
      originalPosition: identities.originalPosition,
    })
    const prepared = await this.commit(preparation, attempt.source)
    if (prepared.kind === 'blocked') return prepared
    return Object.freeze({ kind: 'prepared', preparation, identities, source: prepared.source })
  }
}
