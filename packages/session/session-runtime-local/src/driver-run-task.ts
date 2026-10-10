import type { SessionRunAdmissionBlock } from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { BorrowedRunJournal } from './run-journal-types.ts'
import type { LocalSessionDriverOptions, SessionDriverRunSources } from './driver-types.ts'
import type { DriverTask } from './driver-tasks.ts'
import { startDriverRun, type DriverRunStart } from './driver-run.ts'
import { createDriverModelRunTask } from './driver-model-run.ts'

type Inputs = Pick<
  LocalSessionDriverOptions,
  'ingress' | 'identities' | 'model' | 'tools' | 'work' | 'sources'
>

/** Register this task before it allocates its original Run or any asynchronous source borrow. */
export function createDriverRunTask(options: Inputs, scope: SessionScope): DriverTask {
  const task = new RunTask(options, scope)
  return Object.freeze({
    completion: Promise.resolve().then(() => task.run()),
    admission: task.admission,
    requestStop: task.requestStop,
    close: task.close,
  })
}

class RunTask {
  stopping = false
  starting = true
  released = false
  started?: DriverRunStart
  journal?: BorrowedRunJournal
  sources?: SessionDriverRunSources
  model?: DriverTask
  returned = 0
  returning?: Promise<void>
  constructor(
    readonly options: Inputs,
    readonly scope: SessionScope,
  ) {}
  admission = (): SessionRunAdmissionBlock | null => {
    const started = this.started
    if (started?.kind !== 'blocked') return null
    const result = started.originals.at(-1)
    if (result?.step.kind !== 'startRun' || !('failure' in result.result)) return null
    return result.result.admission ?? null
  }
  requestStop = () => {
    this.stopping = true
    this.model?.requestStop()
  }
  async run(): Promise<'released' | 'retained' | 'admissionBlocked'> {
    try {
      this.started = await startDriverRun(this.options, this.scope, () => !this.stopping)
      if (this.started.kind === 'idle') {
        this.released = true
        return 'released'
      }
      if (this.started.kind === 'blocked') {
        if (!this.admission()) return 'retained'
        this.released = true
        return 'admissionBlocked'
      }
      if (this.stopping) return 'retained'
      const { ingress } = this.options
      const borrowed = await ingress.runJournal.borrow(
        ingress.coordinationAuthority,
        this.scope,
        this.started.preparation.run,
      )
      if (!('journal' in borrowed)) return 'retained'
      this.journal = borrowed.journal
      if (this.stopping) return 'retained'
      const sources = await this.options.sources.acquire(this.scope, this.journal)
      if ('unavailable' in sources) return 'retained'
      this.sources = sources
      if (this.stopping) return 'retained'
      this.model = createDriverModelRunTask({
        options: this.options,
        scope: this.scope,
        prepared: this.started,
        journal: this.journal,
        sources,
      })
      this.starting = false
      const completed = await this.model.completion
      if (completed === 'released') this.released = true
      return completed
    } finally {
      this.starting = false
    }
  }
  returnUnissued() {
    this.returning ??= this.returnBorrows().catch(error => {
      delete this.returning
      throw error
    })
    return this.returning
  }
  async returnBorrows() {
    const returns = [() => this.sources?.release(), () => this.journal?.close()]
    while (this.returned < returns.length) {
      await returns[this.returned]!()
      this.returned++
    }
  }
  close = async (): Promise<'released' | 'pending'> => {
    this.requestStop()
    if (this.released) return 'released'
    if (this.starting) return 'pending'
    if (this.model) return this.model.close()
    // No Model constructor was invoked. Return only these actual input borrows;
    // the original Run/unknown step remains durable and is not declared completed.
    await this.returnUnissued()
    this.released = true
    return 'released'
  }
}
