import {
  acceptSend,
  formBeatUnit,
  formStrongUnit,
  markNotification,
  recordDelivery,
  remindStanding,
  writeBeat,
  writeDestination,
  writeSubscription,
  type NotificationTxn,
} from '@omne-harness/notification'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { sqlTxn } from './facts.ts'
import { PARTICIPANT, PROTOCOL, SCRIPTS, type ScriptName } from './schema.ts'

/** The commands come from this member's own store adapter, so their shape is not parsed again here. */
const RUN: Record<ScriptName, (txn: NotificationTxn, command: never) => unknown> = {
  accept: acceptSend,
  mark: markNotification,
  subscribe: writeSubscription,
  setBeat: (txn, command) => {
    writeBeat(txn, command)
    return null
  },
  destination: writeDestination,
  formStrong: formStrongUnit,
  formBeat: formBeatUnit,
  remind: remindStanding,
  recordDelivery,
}

export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const script = facts['script']
    if (!SCRIPTS.includes(script as ScriptName))
      return { kind: 'failed', diagnostic: 'unknown_notification_script' }
    const result = RUN[script as ScriptName](sqlTxn(port), facts['command'] as never)
    return { kind: 'participated', response: (result ?? null) as JsonValue }
  },
} satisfies ParticipantModule
