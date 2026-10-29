import { succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { PreparationRecord, ReleaseRecord } from '@omne-harness/tool-contract/provider'
import { createMemoryToolEnvironment } from '@omne-harness/tool-contract/testing'
import type { ToolEnvironmentSchedulingPolicy } from '@omne-harness/tool-host-local'
import {
  callId,
  evidence,
  operationId,
  principalA,
  principalB,
  request,
  tenantA,
  tenantB,
  type Principal,
} from './coordinator-values.ts'

export function barrier() {
  const { promise, resolve } = Promise.withResolvers<void>()
  return { wait: promise, open: resolve }
}

export function environmentBoundaryFixture() {
  const backing = createMemoryToolEnvironment<Principal>()
  const calls: PreparationRecord[] = []
  const releases: ReleaseRecord[] = []
  const provider: typeof backing = {
    ...backing,
    prepare: input => {
      calls.push(input.preparation)
      return backing.prepare(input)
    },
    release: input => {
      releases.push(input.release)
      return backing.release(input)
    },
  }
  const policy: ToolEnvironmentSchedulingPolicy<Principal> = {
    quantum: 1,
    capacity: 2,
    inFlight: 1,
    tenant: () => ({ weight: 1, inFlight: 1 }),
    retry: async () => 'recognize',
    release: async () => 'release',
  }
  const preparation = (id: string, tenant = tenantA) => {
    const fixed = request()
    const record: PreparationRecord = {
      tenant,
      call: callId(id),
      operation: operationId(id),
      adoption: backing.adoption,
      inputDigest: canonicalDigest(fixed),
      purpose: 'initial',
      request: fixed,
    }
    return {
      principal: tenant === tenantA ? principalA : principalB,
      tenant,
      call: record.call,
      preparation: record,
    }
  }
  const release = async (input: ReturnType<typeof preparation>) => {
    const result = await backing.inspectPreparation(input)
    if ('failure' in result || result.ok.kind !== 'prepared')
      throw new Error('expected backing allocation')
    return {
      principal: input.principal,
      tenant: input.tenant,
      call: input.call,
      release: {
        tenant: input.tenant,
        call: input.call,
        operation: operationId(`${input.call}/release`),
        adoption: backing.adoption,
        inputDigest: 'release',
        preparation: input.preparation.operation,
        resource: result.ok.environment.evidence,
        custody: evidence('custody'),
      },
    }
  }
  return {
    backing,
    provider,
    policy,
    preparation,
    release,
    calls,
    releases,
    qualify: async () => succeed(undefined),
    other: () => preparation('b', tenantB),
  }
}
