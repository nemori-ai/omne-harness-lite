// Test helper: the contract's in-memory port doubles wrapped with call counts and handle counts.
// Tests assert on these counts; the doubles keep their contract behavior.
import type {
  AdoptionView,
  CatalogStore,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
import type { OutputCheck, OutputValidator } from '@omne-harness/mcp-contract'
import {
  createMemoryAdoptionView,
  createMemoryCredentialUse,
  createMemoryUseEligibility,
  type MemoryAdoptionView,
  type MemoryCredentialUse,
  type MemoryUseEligibility,
} from '@omne-harness/mcp-contract/testing'
import { releasing, reshapedCredentials } from './handles.ts'
import { principalKey, type Principal } from './identities.ts'

export type Counted<T> = T & Readonly<{ calls: () => number }>

export function countedAdoption(): Counted<MemoryAdoptionView<Principal, string>> {
  const memory = createMemoryAdoptionView<Principal, string>({ scopeKey: scope => scope })
  let count = 0
  const port: AdoptionView<Principal, string> = {
    endpoint(access, ref) {
      count += 1
      return memory.endpoint(access, ref)
    },
    endpoints(access, scope) {
      count += 1
      return memory.endpoints(access, scope)
    },
  }
  return { ...memory, ...port, calls: () => count }
}

export function countedEligibility(): Counted<MemoryUseEligibility<Principal>> {
  const memory = createMemoryUseEligibility<Principal>({ principalKey })
  let count = 0
  const port: UseEligibility<Principal> = {
    check(access, endpoint) {
      count += 1
      return memory.check(access, endpoint)
    },
  }
  return { ...memory, ...port, calls: () => count }
}

/** The catalog store with its reads counted: a case asserts that a step did not read it. */
export function countedReads<T extends CatalogStore>(
  store: T,
): T & Readonly<{ reads: () => number }> {
  let count = 0
  return {
    ...store,
    read: key => {
      count += 1
      return store.read(key)
    },
    reads: () => count,
  }
}

/** One credential handle the test can count: how often it was acquired and released. */
export type HandleCount = { acquired: number; released: number }

export type CountedCredentials = MemoryCredentialUse<Principal> &
  Readonly<{ handles: () => readonly HandleCount[] }>

type Trace = (event: string) => void

/** The memory credential double; every handle it gives out is counted and its release traced. */
export function countedCredentials(trace: Trace = () => undefined): CountedCredentials {
  const memory = createMemoryCredentialUse<Principal>()
  const handles: HandleCount[] = []
  const counted = reshapedCredentials(memory, handle => {
    const count: HandleCount = { acquired: 1, released: 0 }
    handles.push(count)
    return releasing(handle, async () => {
      count.released += 1
      trace('credential.release')
      await handle.release()
    })
  })
  return {
    ...memory,
    acquire: counted.acquire,
    handles: () => handles.map(count => ({ ...count })),
  }
}

/** The output validator the tests inject, with its calls recorded: the pairs it was given. */
export type CountedOutputCheck = Readonly<{
  check: OutputValidator
  calls: () => number
}>

/** An output validator that answers `verdict` to every pair and counts its calls. */
export function countedOutputCheck(
  verdict: OutputCheck = { kind: 'conforms' },
): CountedOutputCheck {
  let count = 0
  return {
    check: () => {
      count += 1
      return verdict
    },
    calls: () => count,
  }
}
