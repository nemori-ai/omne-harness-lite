import type {
  AdoptionView,
  CatalogStore,
  ProcessHandle,
  ProcessLanding,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
import type { OutputCheck, OutputValidator, StopScope } from '@omne-harness/mcp-contract'
import {
  createMemoryAdoptionView,
  createMemoryCredentialUse,
  createMemoryProcessLanding,
  createMemoryUseEligibility,
  type MemoryAdoptionView,
  type MemoryCredentialUse,
  type MemoryProcessLanding,
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

export type HandleCount = { acquired: number; released: number }

export type CountedCredentials = MemoryCredentialUse<Principal> &
  Readonly<{ handles: () => readonly HandleCount[] }>

type Trace = (event: string) => void

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

export type ScriptedLanding = MemoryProcessLanding<Principal> &
  Readonly<{
    processes: () => readonly Readonly<{ stops: number }>[]
  }>

export function scriptedLanding(
  options: Readonly<{
    facilities?: readonly string[]
    stop?: StopScope
    trace?: (event: string) => void
  }> = {},
): ScriptedLanding {
  const memory = createMemoryProcessLanding<Principal>({ facilities: options.facilities ?? [] })
  const processes: { stops: number }[] = []
  const port: ProcessLanding<Principal> = {
    async start(access, launch, env) {
      const answer = await memory.start(access, launch, env)
      if ('failure' in answer) return answer
      const record = { stops: 0 }
      processes.push(record)
      const inner = answer.ok
      const handle: ProcessHandle = {
        stdin: inner.stdin,
        stdout: inner.stdout,
        stderr: inner.stderr,
        exited: inner.exited,
        async stop() {
          record.stops += 1
          options.trace?.('process.stop')
          const confirmed = await inner.stop()
          return options.stop ?? confirmed
        },
      }
      return { ok: handle }
    },
  }
  return { ...memory, ...port, processes: () => processes.map(record => ({ ...record })) }
}

export type CountedOutputCheck = Readonly<{
  check: OutputValidator
  calls: () => number
}>

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
