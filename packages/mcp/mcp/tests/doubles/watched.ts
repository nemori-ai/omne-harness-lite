// Test helper: the call port assembled as `assemble` does it, on an in-flight table that tells the
// case how many calls concluded. A call decides its answer in the same synchronous run as its
// conclusion (SPEC MC-16 step 13), so a scan that lands an event k microtasks after a call knows
// whether the call had answered by then without racing the answer's own continuation.
import type { ActionCalls, McpConfig, McpPorts } from '@omne-harness/mcp-contract'
import { createCalls } from '../../src/calls.ts'
import { InFlightCalls, type InFlightKey, type Reservation } from '../../src/internal/in-flight.ts'
import { createConnectionTable, type ConnectionTable } from '../../src/internal/table.ts'
import { TaskTable } from '../../src/internal/task-table.ts'
import type { Principal } from './identities.ts'

/** The in-flight table, counting the conclusions of the places it hands out. */
class ConcludeCounting extends InFlightCalls {
  concluded = 0

  override reserve(key: InFlightKey, signal: AbortSignal): Reservation | 'in-use' {
    const place = super.reserve(key, signal)
    if (place === 'in-use') return place
    return {
      ...place,
      conclude: () => {
        place.conclude()
        this.concluded += 1
      },
    }
  }
}

export type Watched = Readonly<{
  calls: ActionCalls<Principal>
  table: ConnectionTable<Principal>
  /** How many calls concluded so far: each did so in the run that decided its answer. */
  concluded: () => number
}>

export function watchedCalls(
  p: Readonly<{ ports: McpPorts<Principal, string>; config: McpConfig<Principal> }>,
): Watched {
  const table = createConnectionTable(p.ports, p.config)
  const inFlight = new ConcludeCounting()
  const calls = createCalls({
    ports: p.ports,
    config: p.config,
    table,
    inFlight,
    tasks: new TaskTable(),
  })
  return { calls, table, concluded: () => inFlight.concluded }
}
