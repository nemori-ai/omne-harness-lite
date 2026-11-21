import {
  acceptDispatch,
  applyEvent,
  confirmStop,
  recordDelivery,
  type DispatchTxn,
} from '@omne-harness/dispatch'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { sqlTxn } from './facts.ts'
import { PARTICIPANT, PROTOCOL, SCRIPTS, type ScriptName } from './schema.ts'

/** The commands come from this member's own store adapter, so their shape is not parsed again here. */
const RUN: Record<ScriptName, (txn: DispatchTxn, command: never) => unknown> = {
  accept: acceptDispatch,
  apply: applyEvent,
  recordDelivery,
  confirmStop,
}

export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const script = facts['script']
    if (!SCRIPTS.includes(script as ScriptName))
      return { kind: 'failed', diagnostic: 'unknown_dispatch_script' }
    const result = RUN[script as ScriptName](sqlTxn(port), facts['command'] as never)
    return { kind: 'participated', response: (result ?? null) as JsonValue }
  },
} satisfies ParticipantModule
