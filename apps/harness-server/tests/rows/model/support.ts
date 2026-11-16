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
  probe: readonly string[]
}>

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

export const TENANT: TenantId = (() => {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return tenant(organization.value, account.value)
})()

export type Verdict = { ok: undefined } | { failure: { kind: 'denied' } }

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

export const commandsStandIn = defineRow({
  row: 'model-records',
  implementation: 'contract-double',
  manifest: { provides: [modelCommandsKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'model-records-stand-in',
    apply(ctx: Context) {
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
