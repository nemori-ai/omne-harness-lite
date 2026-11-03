// Test helper: the contract's in-memory port doubles wrapped with call counts, handle counts and
// a scripted stop range. Tests assert on these counts; the doubles keep their contract behavior.
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  AdoptionView,
  CredentialFailure,
  CredentialPurpose,
  HttpCredentialHandle,
  HttpPurpose,
  ProcessCredentialHandle,
  ProcessHandle,
  ProcessLanding,
  ProcessPurpose,
  UseEligibility,
} from '@omne-harness/mcp-contract/provider'
import type { CredentialBinding, EndpointHolding, StopScope } from '@omne-harness/mcp-contract'
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
import { principalKey, type Principal } from './values.ts'

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

/** One credential handle the test can count: how often it was acquired and released. */
export type HandleCount = { acquired: number; released: number }

export type CountedCredentials = MemoryCredentialUse<Principal> &
  Readonly<{ handles: () => readonly HandleCount[] }>

type Trace = (event: string) => void

function countingProcessHandle(
  handle: ProcessCredentialHandle,
  count: HandleCount,
  trace: Trace,
): ProcessCredentialHandle {
  return {
    purpose: 'process-env',
    async release() {
      count.released += 1
      trace('credential.release')
      await handle.release()
    },
  }
}

function countingHttpHandle(
  handle: HttpCredentialHandle,
  count: HandleCount,
  trace: Trace,
): HttpCredentialHandle {
  return {
    purpose: 'http-authorization',
    authorize: headers => handle.authorize(headers),
    reportRejection: () => handle.reportRejection(),
    async release() {
      count.released += 1
      trace('credential.release')
      await handle.release()
    },
  }
}

/** The memory credential double; every handle it gives out is counted and its release traced. */
export function countedCredentials(trace: Trace = () => undefined): CountedCredentials {
  const memory = createMemoryCredentialUse<Principal>()
  const handles: HandleCount[] = []
  function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: ProcessPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<ProcessCredentialHandle, CredentialFailure>>
  function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: HttpPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>>
  async function acquire(
    access: Access<Principal>,
    holding: EndpointHolding,
    purpose: CredentialPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<ProcessCredentialHandle | HttpCredentialHandle, CredentialFailure>> {
    const count: HandleCount = { acquired: 1, released: 0 }
    if (purpose.kind === 'process-env') {
      const answer = await memory.acquire(access, holding, purpose, binding)
      if ('failure' in answer) return answer
      handles.push(count)
      return { ok: countingProcessHandle(answer.ok, count, trace) }
    }
    const answer = await memory.acquire(access, holding, purpose, binding)
    if ('failure' in answer) return answer
    handles.push(count)
    return { ok: countingHttpHandle(answer.ok, count, trace) }
  }
  return { ...memory, acquire, handles: () => handles.map(count => ({ ...count })) }
}

export type ScriptedLanding = MemoryProcessLanding<Principal> &
  Readonly<{
    /** Every process handed out, with its stop calls. */
    processes: () => readonly Readonly<{ stops: number }>[]
  }>

/**
 * The memory landing whose processes answer `stop()` with the scripted range. The memory double
 * answers `tree-confirmed`; the script overrides the answer and counts the calls.
 */
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
