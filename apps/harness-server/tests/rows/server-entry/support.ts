import type { Context, Plugin } from '@deepseek-ai/cordis'
import { IdentityOperationsService } from '@omne-harness/identity/cordis'
import {
  adjustableLoginTerms,
  inProcessIdentityOperations,
  manualIdentityClock,
} from '@omne-harness/identity/testing'
import { parseDuration, parseInstant } from '@omne-harness/utc-instant'
import { stubPlugin } from '../../../src/cordis.ts'
import { entryObjects } from '../../../src/entry/index.ts'
import { defineRow } from '../../../src/row.ts'
import { dynamisRow } from '../../../src/rows/dynamis/index.ts'
import { serverEntryRow } from '../../../src/rows/server-entry/index.ts'
import { serveOnce, type ServeRun } from '../../fixtures/serve/harness.ts'
import { TELEMETRY_ROW_CONFIG, connectable, until } from '../../support/listening.ts'

function identityOperations() {
  const start = parseInstant('2026-11-02T00:00:00Z')
  const lifetime = parseDuration('PT3600S')
  const idle = parseDuration('PT600S')
  if (!start.ok || !lifetime.ok || !idle.ok) throw new Error('fixture time did not parse')
  return inProcessIdentityOperations({
    clock: manualIdentityClock(start.value).clock,
    terms: adjustableLoginTerms({ maxLifetime: lifetime.value, idlePeriod: idle.value }).source,
  })
}

class IdentityDouble extends IdentityOperationsService {
  readonly registerAndActivate: IdentityOperationsService['registerAndActivate']
  readonly issueLogin: IdentityOperationsService['issueLogin']
  readonly recognizeLogin: IdentityOperationsService['recognizeLogin']
  constructor(ctx: Context) {
    super(ctx)
    const operations = identityOperations()
    this.registerAndActivate = input => operations.registerAndActivate(input)
    this.issueLogin = input => operations.issueLogin(input)
    this.recognizeLogin = input => operations.recognizeLogin(input)
  }
}

export const identityDoubleRow = defineRow({
  row: 'identity',
  implementation: 'contract-double',
  manifest: { provides: [IdentityOperationsService.provide], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'identity-double',
    apply(ctx: Context) {
      new IdentityDouble(ctx)
    },
  },
})

export type TreeOptions = Readonly<{
  config: unknown
  withoutTelemetry?: boolean
  extraRows?: readonly { id: string; plugin: string; config?: unknown }[]
  extraPlugins?: Readonly<Record<string, Plugin>>
  readinessTimeoutMs?: number
  shutdownDeadlineMs?: number
}>

export type LiveTree = Readonly<{
  stop(reason?: string): Promise<ServeRun>
  finished: Promise<ServeRun>
}>

export function startTree(options: TreeOptions): LiveTree {
  const controller = new AbortController()
  const rows = [
    ...(options.withoutTelemetry === true
      ? []
      : [{ id: 'telemetry', plugin: 'telemetry', config: TELEMETRY_ROW_CONFIG }]),
    { id: 'identity', plugin: 'identityDouble', config: {} },
    { id: 'dynamis', plugin: 'dynamisRow', config: {} },
    { id: 'server-entry', plugin: 'serverEntryRow', config: options.config },
    ...(options.extraRows ?? []).map(row => ({ config: {}, ...row })),
  ]
  const finished = serveOnce({
    distribution: { rows },
    plugins: {
      stubPlugin,
      identityDouble: identityDoubleRow,
      dynamisRow,
      serverEntryRow,
      ...options.extraPlugins,
    },
    entryObjects,
    stopAfterStartup: false,
    stop: controller.signal,
    readinessTimeoutMs: options.readinessTimeoutMs ?? 1500,
    shutdownDeadlineMs: options.shutdownDeadlineMs ?? 4000,
  })
  return {
    finished,
    stop: reason => {
      controller.abort(reason ?? 'test: stop')
      return finished
    },
  }
}

export async function waitListening(tree: LiveTree, port: number): Promise<void> {
  let ended = false
  void tree.finished.then(
    () => (ended = true),
    () => (ended = true),
  )
  await until(async () => {
    if (ended) throw new Error('the tree ended before the entry listened')
    return connectable('127.0.0.1', port)
  }, `port ${port} to listen`)
}
