import type { Context } from '@deepseek-ai/cordis'
import type { Access } from '@omne-harness/legal-identity'
import type {
  ModelDiagnostics,
  ModelDispatchFacts,
  ModelFailure,
} from '@omne-harness/model-contract'
import {
  ModelDiagnosticsService,
  ModelDispatchFactsService,
} from '@omne-harness/model-cordis-contract/cordis'
import {
  createSqlModelDiagnostics,
  createSqlModelDispatchFacts,
  type SqlModelDiagnosticsOptions,
} from '@omne-harness/model-storage-sql'
import type { ModelReadLease } from '../../model/qualification.ts'

type Qualify = (access: Access<unknown>) => Promise<ModelReadLease>

/** A tenant read that holds the read lease across the read and checks the action before and after. */
function qualifying<I extends Access<unknown>, R>(
  read: (input: I) => Promise<R | { failure: ModelFailure }>,
  qualify: Qualify,
  action: 'inspect' | 'read-account',
  deniedAs: string,
): (input: I) => Promise<R | { failure: ModelFailure }> {
  const failureOf = (failure: ModelFailure) => ({
    failure: failure.kind === 'denied' ? { kind: 'denied' as const, action: deniedAs } : failure,
  })
  return async input => {
    const lease = await qualify(input)
    try {
      const resource = { kind: 'tenant' as const }
      const before = await lease.check(action, resource)
      if ('failure' in before) return failureOf(before.failure)
      const result = await read(input)
      const after = await lease.check(action, resource)
      return 'failure' in after ? failureOf(after.failure) : result
    } finally {
      lease.release()
    }
  }
}

export function qualifyingDiagnostics(
  reader: ModelDiagnostics<unknown>,
  qualify: Qualify,
): ModelDiagnostics<unknown> {
  return { list: qualifying(input => reader.list(input), qualify, 'inspect', 'diagnostics') }
}

export function qualifyingDispatchFacts(
  reader: ModelDispatchFacts<unknown>,
  qualify: Qualify,
): ModelDispatchFacts<unknown> {
  return {
    list: qualifying(input => reader.list(input), qualify, 'read-account', 'read-account'),
    ofCall: qualifying(input => reader.ofCall(input), qualify, 'read-account', 'read-account'),
  }
}

type Reads = Pick<SqlModelDiagnosticsOptions<unknown>, 'storage' | 'domains' | 'authority'> &
  Readonly<{
    qualify: Qualify
    diagnostics: Pick<SqlModelDiagnosticsOptions<unknown>, 'diagnosticsRead' | 'retention'>
  }>

/** Provides the two tenant reads of the Model records: the diagnostics and the dispatch facts. */
export function mountReads(ctx: Context, reads: Reads): void {
  const { storage, domains, authority, qualify } = reads
  class Diagnostics extends ModelDiagnosticsService<unknown> {
    readonly list = qualifyingDiagnostics(
      createSqlModelDiagnostics({ storage, domains, authority, ...reads.diagnostics }),
      qualify,
    ).list
  }
  const facts = qualifyingDispatchFacts(
    createSqlModelDispatchFacts({ storage, domains, authority }),
    qualify,
  )
  class DispatchFacts extends ModelDispatchFactsService<unknown> {
    readonly list = facts.list
    readonly ofCall = facts.ofCall
  }
  new Diagnostics(ctx)
  new DispatchFacts(ctx)
}
