import { canonicalDigest, type AccessVerdict, type ToolLedgerStore } from '@omne-harness/tool'
import {
  decodeToolOperationId,
  type ControlProgress,
  type FixedToolRequest,
  type ToolCallId,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import {
  inReachOf,
  type CallAccess,
  type PositionStop,
  type ToolCommands,
  type ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolTargetAvailability } from './ledger-guards.ts'
import { programPositionOf, TOOL_PROGRAM_OWNER } from './program-source.ts'
import type { GuardResource } from './start-coordinator.ts'

type Place = Readonly<{ parent: ToolCallId; ordinal: number }>

/** The guard of one position in the domain that orders starts: the barrier of its program moves it. */
export const programGuard = ({ parent, ordinal }: Place): GuardResource => ({
  owner: TOOL_PROGRAM_OWNER,
  resource: `position:${JSON.stringify([parent, ordinal])}`,
})

/** A call a program made starts under the guard of its position; any other call has none here. */
export function programGuardsOf(request: FixedToolRequest): readonly GuardResource[] {
  const place = programPositionOf(request.consumer)
  return place === null ? [] : [programGuard(place)]
}

const operationOf = (purpose: string, place: Place): ToolOperationId => {
  const digest = canonicalDigest([purpose, place.parent, place.ordinal]).replace(/^sha256:/u, '')
  const made = decodeToolOperationId(`${purpose}-${digest}`)
  if ('failure' in made) throw new TypeError(`${purpose}: the operation cannot be named`)
  return made.ok
}

/** TL-66: a call behind the barrier of its program does not start and is not resumed. */
export function programFenceTarget<P>(
  store: Pick<ToolLedgerStore, 'read'>,
  inner: ToolTargetAvailability<P> | undefined,
): ToolTargetAvailability<P> {
  return {
    async qualify(input): Promise<AccessVerdict> {
      const place = programPositionOf(input.request.consumer)
      if (place !== null) {
        const read = await store.read({ kind: 'call', tenant: input.tenant, call: place.parent })
        if (read.kind !== 'complete')
          return { kind: 'unavailable', diagnostic: 'The program of this call cannot be read.' }
        const program = read.records.find(record => record.kind === 'program')
        const fence = program?.kind === 'program' ? program.program.fence : undefined
        if (fence !== undefined && inReachOf(fence, place.ordinal))
          return { kind: 'denied', reason: 'program-closed' }
      }
      return inner === undefined ? { kind: 'allowed' } : inner.qualify(input)
    },
  }
}

const STOPPED: ReadonlySet<ControlProgress['kind']> = new Set(['stopped', 'already-ended'])
const ASKED: ReadonlySet<ControlProgress['kind']> = new Set(['pending', 'accepted'])

/** What the public control of a call answered a stop with, as its position keeps it. */
export function stopProgressOf(progress: ControlProgress): PositionStop {
  if (STOPPED.has(progress.kind)) return 'stopped'
  if (ASKED.has(progress.kind)) return 'accepted'
  return progress.kind === 'unknown' ? 'unknown' : 'refused'
}

export type ProgramDisposalInput<P, B extends ContentBlock> = Readonly<{
  authority: Pick<ToolStartAuthority<P>, 'invalidate'>
  commands: Pick<ToolCommands<P, B>, 'control'>
}>

/** What a host does for one position behind the barrier: bars its start, and asks its call to stop. */
export function createProgramDisposal<P, B extends ContentBlock>(
  input: ProgramDisposalInput<P, B>,
) {
  type At = CallAccess<P> & Place
  return {
    bar({ principal, tenant, parent, ordinal }: At) {
      const guard = programGuard({ parent, ordinal })
      const operation = operationOf('program-bar', { parent, ordinal })
      const evidence = {
        owner: guard.owner,
        record: guard.resource,
        revision: '0',
        digest: operation,
      }
      return input.authority.invalidate({
        principal,
        tenant,
        operation,
        guard: { ...guard, revision: '0', evidence, scope: { kind: 'resource' } },
      })
    },
    async stop({ principal, tenant, call, parent, ordinal }: At): Promise<PositionStop> {
      const operation = operationOf('program-stop', { parent, ordinal })
      try {
        const answer = await input.commands.control({
          principal,
          tenant,
          call,
          operation,
          intent: { kind: 'stop' },
        })
        if ('ok' in answer) return stopProgressOf(answer.ok.progress)
        return answer.failure.kind === 'commit-unknown' || answer.failure.kind === 'unavailable'
          ? 'unknown'
          : 'refused'
      } catch {
        return 'unknown'
      }
    },
  }
}
