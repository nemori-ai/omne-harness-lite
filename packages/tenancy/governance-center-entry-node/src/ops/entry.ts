import type { EntryMaintenanceResources } from '@omne-harness-lite/governance-center-entry'
import { LISTENING_EVENT as listening } from '@omne-harness-lite/governance-center-entry'
import type { Server } from 'node:net'
import { join } from 'node:path'
import {
  createWork,
  GovernanceCenterWorkStopped,
  releaseSubscriptions,
  type GovernanceCenterWork,
} from '../work.ts'
import type { GovernanceCenterOpsConfig } from './config.ts'
import type { GovernanceCenterOpsDependencies } from './dependencies.ts'
import type { OnlineMaintenance } from '../maintenance/online.ts'
import { createOnlineMaintenance } from '../maintenance/assembly.ts'
import { OpsFace } from './face.ts'
import { createHealthSources } from './health-sources.ts'
import { listenOnSocket, prepareSocketPath } from './socket.ts'

export function createGovernanceCenterOps(
  config: GovernanceCenterOpsConfig,
  dependencies: GovernanceCenterOpsDependencies,
): GovernanceCenterWork {
  let maintenance: OnlineMaintenance | undefined
  let completion: EntryMaintenanceResources | undefined
  let face: OpsFace | undefined
  let path: string | undefined
  let server: Server | undefined
  let closeBound: (() => Promise<void>) | undefined
  const subscriptions: (() => void)[] = []
  const controller: { status: 'pending' | 'clean' | 'error' } = { status: 'pending' }
  return createWork(
    async current => {
      const assertCurrent = (): void => {
        if (!current()) throw new GovernanceCenterWorkStopped()
      }
      assertCurrent()
      const { storage, clock, logger } = dependencies
      if (storage.maintenance === undefined)
        throw new Error('owned snapshot maintenance is required')
      const resources = dependencies.maintenance
      completion = resources
      if (
        !Array.isArray(resources.snapshotChecks) ||
        resources.snapshotChecks.length === 0 ||
        resources.snapshotChecks.some(check => typeof check !== 'function') ||
        typeof resources.closed !== 'function'
      )
        throw new TypeError('invalid entry maintenance resources')
      assertCurrent()
      maintenance = createOnlineMaintenance({
        ...config.maintenance,
        snapshotChecks: resources.snapshotChecks,
        workDirectory: join(config.maintenance.backupDirectory, '.quarantine'),
        source: storage.maintenance,
        clock,
        report: diagnostic =>
          logger.error(
            'maintenance-residual: %s; published: %s',
            diagnostic.temporaryLocation,
            diagnostic.publishedLocation ?? '(none)',
          ),
        onClosed: status => {
          controller.status = status
        },
      })
      face = new OpsFace(
        createHealthSources({
          storage,
          clock,
          deploymentKey: config.deploymentKey,
          deploymentParameters: config.deploymentParameters,
          reportProbeDefect: errorName =>
            logger.error('storage probe for the full health check failed with %s', errorName),
        }),
        logger,
        maintenance,
        dependencies.opening,
        failed => resources.closed(!failed && controller.status === 'clean' ? 'clean' : 'error'),
      )
      const instance = face
      // Install all three subscriptions before the first await; this owner removes them after close.
      subscriptions.push(
        dependencies.notifications.onServing(notice => {
          if (current()) instance.onServing(notice)
        }),
      )
      assertCurrent()
      subscriptions.push(dependencies.notifications.onStopped(() => instance.onStopped()))
      assertCurrent()
      subscriptions.push(dependencies.notifications.onDefect(() => instance.onDefect()))
      assertCurrent()

      path = await prepareSocketPath(config.socketDirectory)
      assertCurrent()
      server = await listenOnSocket(path)
      const boundServer = server
      const boundPath = path
      closeBound = () => instance.dispose(boundServer, boundPath)
      assertCurrent()
      server.on('connection', socket => instance.accept(socket))
      // 监听期间的服务器错误（例如接受连接时句柄耗尽）只记下，不让进程因未处理的 error 退出
      server.on('error', error => logger.error('ops socket server error: %s', error.name))
      // 握手：开着门的入口层据此重发 `serving`；处理者抛出只记 error（emit 不隔离监听者）
      try {
        dependencies.notifications.listening()
      } catch (error) {
        logger.error(
          'a listener of %s threw: %s',
          listening,
          error instanceof Error ? error.name : 'non-error',
        )
      }
      assertCurrent()
    },
    () => face?.onStopped(),
    async () => {
      if (closeBound !== undefined) await closeBound()
      else if (maintenance !== undefined) {
        // No socket was acquired; never unlink another owner's socket path.
        try {
          await maintenance.close()
        } finally {
          completion?.closed(controller.status === 'clean' ? 'clean' : 'error')
        }
      }
    },
    () => dependencies.isCurrent(),
    () => releaseSubscriptions(subscriptions),
  )
}
