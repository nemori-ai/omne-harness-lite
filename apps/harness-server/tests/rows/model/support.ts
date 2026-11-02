// Shared fixtures of the model-side row tests. A row under test loads in `serve` mode through
// `serveOnce`, next to the objects it needs and a probe row that keeps the live tree open while the
// test calls the services the row provides. Every stand-in below is named and says what it stands for.
import { Service, type Context } from '@deepseek-ai/cordis'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  ModelConverterAuthorityService,
  ModelPublicationAuthorityService,
  modelCommandsKey,
  modelConverterAuthorityKey,
  modelPublicationAuthorityKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { stubPlugin } from '../../../src/cordis.ts'
import { defineRow } from '../../../src/row.ts'
import type { EntryObjectModule, RowId } from '../../../src/types.ts'
import { serveOnce, type ServeRun } from '../../fixtures/serve/harness.ts'

type RowEntry = Readonly<{ id: string; plugin: string; config?: unknown }>

const PROBE = 'model-probe' as RowId

function probeRow(names: readonly string[], capture: (ctx: Context) => void) {
  return defineRow({
    row: PROBE,
    implementation: 'real',
    manifest: { provides: [], injects: names, sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'model-probe',
      inject: [...names],
      apply(ctx: Context) {
        capture(ctx)
      },
    },
  })
}

export type LiveInput = Readonly<{
  rows: readonly RowEntry[]
  plugins: Readonly<Record<string, unknown>>
  entryObjects?: readonly EntryObjectModule[]
  /** The service names the probe row injects. The probe row waits for all of them. */
  probe: readonly string[]
}>

/**
 * Starts the rows and a probe, runs `use` against the probe's context while the tree is up, then
 * stops the tree and returns the run for the startup assertions.
 */
export async function withLiveRows<T>(
  input: LiveInput,
  use: (ctx: Context) => Promise<T> | T,
): Promise<{ value: T; run: ServeRun }> {
  const stop = new AbortController()
  let ready: (ctx: Context) => void = () => {}
  const captured = new Promise<Context>(resolve => {
    ready = resolve
  })
  const running = serveOnce({
    distribution: {
      rows: [
        ...input.rows.map(row => ({ config: {}, ...row })),
        { id: PROBE, plugin: 'probe', config: {} },
      ],
    },
    plugins: { stubPlugin, ...input.plugins, probe: probeRow(input.probe, ready) },
    ...(input.entryObjects === undefined ? {} : { entryObjects: input.entryObjects }),
    stopAfterStartup: false,
    stop: stop.signal,
    readinessTimeoutMs: 30_000,
    shutdownDeadlineMs: 10_000,
  })
  try {
    const ctx = await Promise.race([
      captured,
      running.then(run => {
        throw new Error(`the tree ended before the probe ran: ${JSON.stringify(run.stderr)}`)
      }),
    ])
    const value = await use(ctx)
    stop.abort('test done')
    return { value, run: await running }
  } catch (error) {
    stop.abort('test failed')
    await running.catch(() => undefined)
    throw error
  }
}

// --- identities ---------------------------------------------------------------------------------

export const TENANT: TenantId = (() => {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return tenant(organization.value, account.value)
})()

// --- stand-ins for what the assembly provides ----------------------------------------------------

/** What a stand-in verdict looks like: the authorities return `ok` unless a test says otherwise. */
export type Verdict = { ok: undefined } | { failure: { kind: 'denied' } }

/**
 * Stands for the `modelPublicationAuthority` entry object. The real one checks the original
 * instance qualification against the host; no such entry object is registered yet, so the tests
 * supply this one. It carries a verdict the test can switch.
 */
export function publicationAuthorityEntry(verdict: { current: Verdict }): EntryObjectModule {
  class Authority extends ModelPublicationAuthorityService<unknown> {
    readonly check = () => verdict.current
  }
  return {
    name: modelPublicationAuthorityKey,
    implementation: 'contract-double',
    install(scope) {
      new Authority(scope)
    },
  }
}

/** Stands for the `modelConverterAuthority` entry object, for the same reason. */
export function converterAuthorityEntry(verdict: { current: Verdict }): EntryObjectModule {
  class Authority extends ModelConverterAuthorityService<unknown> {
    readonly check = () => verdict.current
  }
  return {
    name: modelConverterAuthorityKey,
    implementation: 'contract-double',
    install(scope) {
      new Authority(scope)
    },
  }
}

/**
 * Stands for the `model-records` row, which has no real member yet (see the closure report). It
 * provides `modelCommands` with the one operation the preparation leases read, `dispatches`, and
 * answers every call `unavailable`; the other operations are absent. A lease without a lineage
 * never reads it.
 */
export const commandsStandIn = defineRow({
  row: 'model-records',
  implementation: 'contract-double',
  manifest: { provides: [modelCommandsKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'model-records-stand-in',
    apply(ctx: Context) {
      // A plain `Service` under the formal key: the abstract `ModelCommandsService` would need all
      // 22 operations, and no test here reads more than `dispatches`.
      class Commands extends Service {
        constructor(scope: Context) {
          super(scope, modelCommandsKey)
        }

        readonly dispatches = () =>
          Promise.resolve({
            failure: {
              kind: 'unavailable' as const,
              dependency: 'model-records-stand-in',
              diagnostic: 'no durable records',
            },
          })
      }
      new Commands(ctx)
    },
  },
})
