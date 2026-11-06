import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
export default {
  participant: 'hitl.independent-control',
  protocol: 'independent-wait/1',
  execute() {
    return { kind: 'unsupported', basis: { reason: 'migration-owner-only' } }
  },
} satisfies ParticipantModule
