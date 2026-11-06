import type * as M from '@omne-harness/model-contract'
import type { SelectedModel } from './values.js'
import { canonical } from './internal.js'
import {
  leaseFailure,
  measureWithLease,
  type MeasureContext,
  type MeasurementFailure,
} from './measurement.js'

export type CandidateMeasure = (
  selection: SelectedModel,
  lineage: M.PreparationLineage,
  assembled: M.AssembledModelInput,
) => Promise<M.RequestBudget | MeasurementFailure>

type Entry = {
  acquired: ReturnType<M.ModelPreparationResources<unknown>['acquire']>
  users: number
  reusable: boolean
  released?: Promise<void>
}
const capacity = 4
const maxPending = 8
function failed(value: { kind: string }): boolean {
  return ['denied', 'invalid', 'unavailable', 'unknown'].includes(value.kind)
}
function unavailable(diagnostic: string): MeasurementFailure {
  return { kind: 'unavailable', owner: 'preparation', diagnostic }
}

/** The retained entries own their first facts snapshot until this one plan finishes. */
class MeasurementSession<P> {
  private readonly entries = new Map<string, Entry>()
  private readonly pending = new Set<Promise<unknown>>()
  private closed = false
  private failure: MeasurementFailure | null = null

  private readonly context: MeasureContext<P>

  constructor(context: MeasureContext<P>) {
    this.context = context
  }

  readonly measure: CandidateMeasure = (selection, lineage, assembled) => {
    if (this.closed) return Promise.resolve(unavailable('Compaction measurement session is closed'))
    if (this.pending.size >= maxPending) {
      const failure = unavailable('Compaction measurement concurrency limit exceeded')
      this.failure ??= failure
      return Promise.resolve(failure)
    }
    const task = this.use(selection, lineage, assembled)
    this.pending.add(task)
    const finished = () => this.pending.delete(task)
    void task.then(finished, finished)
    return task
  }

  private entry(selection: SelectedModel, lineage: M.PreparationLineage): Entry {
    const key = canonical({ profile: selection.profile, lineage })
    const found = this.entries.get(key)
    if (found !== undefined) {
      this.entries.delete(key)
      this.entries.set(key, found)
      return found
    }
    const retained = [...this.entries].filter(([, entry]) => entry.reusable)
    const idle =
      retained.length < capacity ? undefined : retained.find(([, entry]) => entry.users === 0)
    if (idle !== undefined) this.entries.delete(idle[0])
    const acquire = async () => {
      if (idle !== undefined) await this.release(idle[1])
      return this.context.preparation.acquire({
        ...this.context.access,
        profile: selection.profile,
        lineage,
      })
    }
    const entry: Entry = {
      acquired: acquire(),
      users: 0,
      reusable: retained.length < capacity || idle !== undefined,
    }
    this.entries.set(key, entry)
    return entry
  }

  private async use(
    selection: SelectedModel,
    lineage: M.PreparationLineage,
    assembled: M.AssembledModelInput,
  ): Promise<M.RequestBudget | MeasurementFailure> {
    const entry = this.entry(selection, lineage)
    entry.users++
    try {
      const acquired = await entry.acquired
      const result =
        'failure' in acquired
          ? leaseFailure(acquired.failure)
          : await measureWithLease(acquired.ok, selection.profile, assembled)
      if (result.kind !== 'complete' && result.kind !== 'deferred-media') {
        this.failure ??= result
        this.retire(entry)
      }
      return result
    } catch (error) {
      this.failure ??= unavailable('Compaction measurement threw')
      this.retire(entry)
      throw error
    } finally {
      entry.users--
      if (!entry.reusable && entry.users === 0) {
        this.retire(entry)
        await this.release(entry)
      }
    }
  }

  private retire(entry: Entry): void {
    entry.reusable = false
    for (const [key, current] of this.entries) {
      if (current === entry) this.entries.delete(key)
    }
  }

  private release(entry: Entry): Promise<void> {
    entry.released ??= (async () => {
      let acquired: Awaited<Entry['acquired']>
      try {
        acquired = await entry.acquired
      } catch {
        return
      }
      if ('failure' in acquired) return
      try {
        const released = await acquired.ok.release()
        if (released.failure !== undefined)
          this.failure ??= unavailable(
            `Model preparation lease was not given back: ${released.failure.diagnostic}`,
          )
      } catch {
        this.failure ??= unavailable('Model preparation lease release threw')
      }
    })()
    return entry.released
  }

  async close(): Promise<MeasurementFailure | null> {
    this.closed = true
    await Promise.allSettled(this.pending)
    await Promise.all([...this.entries.values()].map(entry => this.release(entry)))
    this.entries.clear()
    return this.failure
  }
}

/** Cleanup completes before the operation publishes any result, including policy failures. */
export async function withMeasurementSession<P, R extends { kind: string }>(
  context: MeasureContext<P>,
  operation: (measure: CandidateMeasure) => Promise<R>,
): Promise<R | MeasurementFailure> {
  const session = new MeasurementSession({ ...context, access: { ...context.access } })
  let result: R
  let releaseFailure: MeasurementFailure | null = null
  try {
    result = await operation(session.measure)
  } finally {
    releaseFailure = await session.close()
  }
  return releaseFailure !== null && !failed(result) ? releaseFailure : result
}
