import type {
  AgentExecutionControl,
  AgentExecutionRecovery,
  Failure,
  NestedActionAdmission,
} from '@omne-harness/agent-contract'
import type { AgentInstanceProvision } from '@omne-harness/agent-cordis-contract'
import {
  agentExecutionControlKey,
  agentExecutionRecoveryKey,
  agentInstanceHostKey,
  agentInstanceProvisionKey,
  agentNestedActionsKey,
  agentPublicationAuthorityKey,
  type AgentInstanceHostService,
  type AgentPublicationAuthority,
} from '@omne-harness/agent-cordis-contract/cordis'
import { defineEntry } from '@omne-harness/assembly-cordis/cordis'
import type { ProgramActionAdmission } from '@omne-harness/tool-contract/provider'
import { toolProgramAdmissionKey } from '@omne-harness/tool-cordis-contract/cordis'
import type { RowEntry } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'

const NONE = 'no generation of the Agent host serves now'
const DRAIN_MS = 10_000

const failure: Failure = { kind: 'unavailable', owner: 'agent-host', diagnostic: NONE }
const unavailable = async () => ({ failure })
const unanswerable = async () => ({ kind: 'unanswerable', diagnostic: NONE }) as const

const drain = {
  drainTimeoutMs: DRAIN_MS,
  clock: { delay: (ms: number) => monotonicClock.after(ms).promise },
}

/** The entries of the Agent host row: what the rows that depend on it inject, whichever generation serves. */
export function agentHostEntries(): readonly RowEntry[] {
  return [
    defineEntry<AgentPublicationAuthority<unknown>>({
      key: agentPublicationAuthorityKey,
      unavailable: { check: () => ({ failure }) },
      ...drain,
    }),
    defineEntry<AgentExecutionRecovery<unknown>>({
      key: agentExecutionRecoveryKey,
      unavailable: {
        query: unavailable,
        load: unavailable,
        reconcile: unavailable,
        detach: unavailable,
        handOver: unavailable,
        contact: unavailable,
      },
      ...drain,
    }),
    defineEntry<AgentExecutionControl<unknown>>({
      key: agentExecutionControlKey,
      unavailable: { control: unavailable },
      ...drain,
    }),
    defineEntry<NestedActionAdmission<unknown>>({
      key: agentNestedActionsKey,
      unavailable: { admit: unanswerable },
      ...drain,
    }),
    // Read from outside by its route alone; with no generation an instance has no live route.
    defineEntry<Pick<AgentInstanceHostService<unknown>, 'route'>>({
      key: agentInstanceHostKey,
      unavailable: { route: () => null },
      ...drain,
    }),
    defineEntry<AgentInstanceProvision<unknown>>({
      key: agentInstanceProvisionKey,
      unavailable: { acquire: unavailable },
      ...drain,
    }),
    defineEntry<ProgramActionAdmission<unknown>>({
      key: toolProgramAdmissionKey,
      unavailable: { admit: unanswerable },
      ...drain,
    }),
  ]
}
