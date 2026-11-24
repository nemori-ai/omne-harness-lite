import { bootOf } from './files.ts'
import { createHandles } from './handles.ts'
import {
  candidatesOf,
  coversOf,
  stateOf,
  type CandidateFaults,
  type ReadContext,
  type StoreCandidateRequest,
} from './reading.ts'
import {
  adopt,
  appendTo,
  beginRebuild,
  compact,
  type AppendFaults,
  type StoreAppendRequest,
} from './writing.ts'

export type StoreOptions = Readonly<{
  root: string
  /** The version of the text rules; an index built with another one is stale. */
  extraction: number
  readOnly: boolean
  /** How many vocabulary terms two code points may expand to before they narrow nothing. */
  vocabularyLimit: number
  /** Which start of the machine this is; left out, it is read from the system. */
  boot?: number
}>

/** The synchronous half of the index: one instance lives in one thread. */
export function createStore(options: StoreOptions) {
  const handles = createHandles(options.readOnly)
  const context: ReadContext = { ...options, boot: options.boot ?? bootOf(), handles }
  return {
    state: (tenant: string) => stateOf(context, tenant),
    candidates: (request: StoreCandidateRequest, faults?: CandidateFaults) =>
      candidatesOf(context, request, faults),
    covers: (tenant: string, generation: number) => coversOf(context, tenant, generation),
    append: (request: StoreAppendRequest, faults?: AppendFaults) =>
      appendTo(context, request, faults),
    beginRebuild: (tenant: string, total: number) => beginRebuild(context, tenant, total),
    adopt: (tenant: string, generation: number) => adopt(context, tenant, generation),
    compact: (tenant: string, pages: number) => compact(context, tenant, pages),
    close: () => handles.close(),
  }
}

export type Store = ReturnType<typeof createStore>
export type { StoreCandidateRequest, StoreCandidates, StoreFailure, StoreState } from './reading.ts'
export type { StoreAppendRequest } from './writing.ts'
