import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { AppendResult, OwnedLogEntry } from '@omne-harness-lite/session-log'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { inspectSettlementPrefixEntries } from '@omne-harness-lite/model-request-runtime'
import type {
  ModelCallPublishPermit,
  ModelCreationPublication,
} from '@omne-harness-lite/model-request-runtime'
import {
  readSettlementPrefix,
  settlementGenerationCurrent,
  type SettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import { settlementAppendReceipt } from '@omne-harness-lite/model-request-runtime'
import { requestStopAndWait } from '@omne-harness-lite/model-request-runtime'
import type {
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'

const unavailable = { unavailable: true } as const
type Outcome = { readonly published: true } | { readonly released: true } | typeof unavailable

interface CreationPublicationInput {
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly registration: SettlementRegistration
  readonly task: SettlementTask<AppendResult>
  readonly permit: ModelCallPublishPermit
  readonly entry: OwnedLogEntry
  readonly callId: string
}

/** S-85: the original creation batch and all tasks that can still publish or read it. */
export function createSessionModelCreationPublication(
  input: CreationPublicationInput,
): ModelCreationPublication {
  const publication = new CreationPublication(input)
  return Object.freeze({
    retry: (admit: () => boolean) => publication.retry(admit),
    close: () => publication.close(),
  })
}

class CreationPublication {
  readonly #reads = new Set<SettlementTask<unknown>>()
  #task: SettlementTask<AppendResult>
  #running: Promise<Outcome> | undefined
  #closing = false
  #released = false
  #permitReleased = false
  #releaseAttempted = false

  constructor(readonly input: CreationPublicationInput) {
    this.#task = input.task
  }

  retry(admit: () => boolean): Promise<Outcome> {
    if (this.#closing || this.#running !== undefined) return Promise.resolve(unavailable)
    return this.#run(admit)
  }

  async close(): Promise<{ readonly released: true } | typeof unavailable> {
    this.#closing = true
    await this.#running
    const result = await this.#run(() => false)
    return 'released' in result ? result : unavailable
  }

  #run(admit: () => boolean): Promise<Outcome> {
    if (this.#running !== undefined) return this.#running
    const attempt = this.#advance(admit).catch(() => unavailable)
    this.#running = attempt
    const finish = () => {
      if (this.#running === attempt) this.#running = undefined
    }
    void attempt.then(finish, finish)
    return attempt
  }

  async #advance(admit: () => boolean): Promise<Outcome> {
    if (this.#released) return this.#closing ? { released: true } : { published: true }
    if (this.#releaseAttempted) return unavailable
    await requestStopAndWait(this.#task)
    const prefix = await this.#read()
    if (prefix === undefined) return unavailable
    const state = this.#state(prefix)
    if (state === 'unknown') return unavailable
    if (this.#closing) return await this.#finish({ released: true })
    if (state === 'present') return await this.#finish({ published: true })
    if (state !== 'absent' || !this.#admitted(admit)) return unavailable
    return await this.#append(prefix.tail, admit)
  }

  async #read(): Promise<SettlementPrefix | undefined> {
    await this.#stopReads()
    const { binding, registration } = this.input
    const result = await readSettlementPrefix({
      binding,
      registration: {
        start: (kind, operation) => {
          const task = registration.start(kind, operation)
          this.#reads.add(task)
          return task
        },
        release: registration.release,
      },
    })
    await this.#stopReads()
    return 'prefix' in result ? result.prefix : undefined
  }

  async #stopReads(): Promise<void> {
    const results = await Promise.allSettled([...this.#reads].map(requestStopAndWait))
    const failed = results.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    this.#reads.clear()
  }

  #state(prefix: SettlementPrefix): 'present' | 'absent' | 'blocked' | 'unknown' {
    const { entry, callId } = this.input
    const inspected = inspectSettlementPrefixEntries({ prefix })
    if (!('ok' in inspected)) return 'unknown'
    const matches = prefix.entries.filter(value => value.dedupeKey === entry.dedupeKey)
    if (matches.length > 1) return 'unknown'
    const prior = matches[0]
    if (prior !== undefined) {
      const { session: _session, position: _position, ...original } = prior
      return modelLogJsonEqual(original, entry) ? 'present' : 'blocked'
    }
    const occupied = inspected.ok.some(({ captured }) => {
      const record = captured.record
      return record !== null && 'call' in record && record.call === callId
    })
    return occupied ? 'blocked' : 'absent'
  }

  #admitted(admit: () => boolean): boolean {
    return (
      !this.#closing &&
      settlementGenerationCurrent(this.input.binding) &&
      this.input.owner.admission() === 'open' &&
      admit()
    )
  }

  async #append(tail: JsonNumber, admit: () => boolean): Promise<Outcome> {
    const { binding, registration, entry } = this.input
    let started = false
    this.#task = registration.start('controlAppend', async () => {
      if (!this.#admitted(admit)) return { failure: 'unavailable' } as const
      started = true
      return await binding.log.append(
        binding.session,
        [entry],
        { kind: 'unfenced' },
        { kind: 'tailEquals', tail },
      )
    })
    const receipt = settlementAppendReceipt(await this.#task.completion, 1)
    if (!started || receipt === null || 'failure' in receipt) return unavailable
    await requestStopAndWait(this.#task)
    return await this.#finish({ published: true })
  }

  async #finish(
    result: { readonly published: true } | { readonly released: true },
  ): Promise<Outcome> {
    if (!this.#permitReleased) {
      if (!('released' in (await this.input.permit.release()))) return unavailable
      this.#permitReleased = true
    }
    this.#releaseAttempted = true
    this.input.registration.release()
    this.#released = true
    return result
  }
}
