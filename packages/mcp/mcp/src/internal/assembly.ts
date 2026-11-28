import type { McpClock, McpConfig, McpPorts, McpServices } from '@omne-harness/mcp-contract'
import { createConnections } from '../connections.ts'
import { createDiscovery } from '../discovery.ts'
import { createInspection } from '../inspection.ts'
import { createInvoker } from '../invoker.ts'
import { createStatus } from '../status.ts'
import { createTasks } from '../tasks.ts'
import { createTaskWatch, type TaskTimer } from '../watch.ts'
import { createChangeFeed } from './changes.ts'
import { createConnect } from '../connect.ts'
import { createFollowing, type Pause } from './follow.ts'
import { InFlightCalls } from './in-flight.ts'
import { createConnectionTable, type ConnectionTable, type TableRuntime } from './table.ts'

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

const hostTimer: TaskTimer = (ms, signal) =>
  new Promise(resolve => {
    /* wall-clock: poll -- the wait before the task watcher looks at a task again */
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

export function assemble<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
  runtime?: TableRuntime,
  pause: Pause = hostPause,
  timer: TaskTimer = hostTimer,
): Assembled<P, S> {
  const table = createConnectionTable(ports, config, runtime)
  const clock = ports.clock ?? hostClock
  const deps = {
    ports,
    config,
    table,
    clock,
    inFlight: new InFlightCalls(),
    changes: createChangeFeed(),
    following: createFollowing(table.runtime.scope, pause),
  }
  const invoker = createInvoker(deps)
  const settings = config.taskWatch
  const watch =
    settings === undefined
      ? undefined
      : createTaskWatch({ ports, config, clock, control: createTasks(deps), settings, timer })
  const connections = createConnections(deps)
  return {
    table,
    services: {
      inspection: createInspection(),
      discovery: createDiscovery(deps),
      invoker,
      ...(watch === undefined ? {} : { tasks: watch }),
      status: createStatus(deps),
      connect: createConnect(deps),
      connections: {
        ...connections,
        closeAll: async () => {
          watch?.close()
          return connections.closeAll()
        },
      },
    },
  }
}
