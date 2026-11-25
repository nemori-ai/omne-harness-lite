import {
  arrangeBatch,
  lockItems,
  pileItems,
  placeReference,
  scatterPile,
  takeItems,
  type CanvasFacts,
} from '@omne-harness/canvas'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { sqlFacts } from './facts.ts'
import { PARTICIPANT, PROTOCOL, SCRIPTS, type ScriptName } from './schema.ts'

/** The commands come from this member's own store adapter, so their shape is not parsed again here. */
const RUN: Record<ScriptName, (facts: CanvasFacts, command: never) => unknown> = {
  place: placeReference,
  arrange: arrangeBatch,
  take: takeItems,
  pile: pileItems,
  scatter: scatterPile,
  lock: lockItems,
}

/** The participant that owns the tables. Each write is one script of the domain, in one transaction. */
export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const script = facts['script']
    const tenant = facts['tenant']
    if (!SCRIPTS.includes(script as ScriptName) || typeof tenant !== 'string')
      return { kind: 'failed', diagnostic: 'unknown_canvas_script' }
    const result = RUN[script as ScriptName](sqlFacts(port, tenant), facts['command'] as never)
    return { kind: 'participated', response: JSON.parse(JSON.stringify(result)) as JsonValue }
  },
} satisfies ParticipantModule
