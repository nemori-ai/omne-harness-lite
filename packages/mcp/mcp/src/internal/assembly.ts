import type { McpClock, McpConfig, McpPorts, McpServices } from '@omne-harness/mcp-contract'
import { createConnections } from '../connections.ts'
import { createDiscovery } from '../discovery.ts'
import { createInspection } from '../inspection.ts'
import { createInvoker } from '../invoker.ts'
import { createStatus } from '../status.ts'
import { createChangeFeed } from './changes.ts'
import { createFollowing, type Pause } from './follow.ts'
import { InFlightCalls } from './in-flight.ts'
import { createConnectionTable, type ConnectionTable, type TableRuntime } from './table.ts'
import { TaskTable } from './task-table.ts'

export type Assembled<P, S> = Readonly<{
  services: McpServices<P, S>
  table: ConnectionTable<P>
}>

const hostClock: McpClock = {
  now: () =>
    /* wall-clock: observation-time -- acquiredAt of a listing; no decision here reads it */ new Date(),
}

const hostPause: Pause = ms =>
  new Promise(resolve => {
    /* wall-clock: backoff -- the wait before a broken long request is opened again */
    setTimeout(resolve, ms * (0.5 + Math.random() / 2))
  })

export function assemble<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
  runtime?: TableRuntime,
  pause: Pause = hostPause,
): Assembled<P, S> {
  const table = createConnectionTable(ports, config, runtime)
  const clock = ports.clock ?? hostClock
  const deps = {
    ports,
    config,
    table,
    clock,
    inFlight: new InFlightCalls(),
    tasks: new TaskTable(),
    changes: createChangeFeed(),
    following: createFollowing(table.runtime.scope, pause),
  }
  return {
    table,
    services: {
      inspection: createInspection(),
      discovery: createDiscovery(deps),
      invoker: createInvoker(deps),
      status: createStatus(deps),
      connections: createConnections(deps),
    },
  }
}
