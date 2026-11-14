// The `model-host` row with the judge of the run's state lock (`createModelHostRow({ lostContact })`,
// as `serve` builds it): a call that an earlier tree admitted on the same storage, and that the
// host of this tree never drove, answers `lost` with the evidence of the lock. The rows are the
// real storage rows of `records-host.spec.ts`, without the credential row; the `identity` row and
// the W of the fixture tenant are the same stand-ins.
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import type { Principal, TenantStandingReading } from '@omne-harness/identity'
import {
  TenantStandingSourceService,
  identityGovernanceKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeModelOperationId,
  decodeProviderName,
  encodeModelInvocationRef,
  type FixedModelRequest,
  type ModelRuntime,
} from '@omne-harness/model-contract'
import { modelRuntimeKey } from '@omne-harness/model-cordis-contract/cordis'
import { stubPlugin } from '../../../src/cordis.ts'
import { cursorSigning } from '../../../src/entry/cursor-signing.ts'
import { identityClock } from '../../../src/entry/identity-clock.ts'
import { modelClock } from '../../../src/entry/model-clock.ts'
import { modelHostAuthority } from '../../../src/entry/model-authorities.ts'
import {
  principalIssuer,
  principalVerifier,
  sessionWorkIssuerOf,
} from '../../../src/entry/principals.ts'
import { storageHost } from '../../../src/entry/storage-host.ts'
import { LOCAL_TOKENIZERS } from '../../../src/local/operator-defaults.ts'
import { defineRow } from '../../../src/row.ts'
import { COMBINATION_VERSION } from '../../../src/rows/agent-journal/config.ts'
import { authorization } from '../../../src/rows/authorization/row.ts'
import { createModelHostRow, modelHostRow } from '../../../src/rows/model-host/index.ts'
import { modelProfilesRow } from '../../../src/rows/model-profiles/index.ts'
import { modelRecordsRow } from '../../../src/rows/model-records/index.ts'
import { modelRequestPreparationRow } from '../../../src/rows/model-request-preparation/index.ts'
import { modelTokenizersRow } from '../../../src/rows/model-tokenizers/index.ts'
import { sessionStorageRow } from '../../../src/rows/session-storage/index.ts'
import { storageRow } from '../../../src/rows/storage/index.ts'
import { acquireStateLock, lostContactBy, type StateLock } from '../../../src/state-lock.ts'
import type { EntryObjectModule } from '../../../src/types.ts'
import { modelRowsOperatorConfig } from '../../r9/support.ts'
import { providerConfig } from '../storage/fixtures/tree.ts'
import { TENANT, withLiveRows } from '../model/support.ts'

const bases: string[] = []
const locks: StateLock[] = []
afterEach(() => {
  for (const lock of locks.splice(0)) lock.release()
  for (const base of bases.splice(0)) rmSync(base, { recursive: true, force: true })
})

const WORK_KEY = 'testWorkPrincipal'

function must<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(JSON.stringify(outcome.failure))
}

const CALL = must(decodeModelCallId('mcall_before'))
const ADMISSION = must(decodeModelOperationId('mop_admit_before'))
const REFERENCE = must(
  encodeModelInvocationRef({ tenant: TENANT, call: CALL, admission: ADMISSION }),
)
const ADOPTION = { owner: 'o', name: 'lost-contact', revision: '1', digest: '0'.repeat(64) }
const REQUEST: FixedModelRequest = {
  profile: ADOPTION,
  suppliers: [
    {
      adoption: ADOPTION,
      provider: must(decodeProviderName('test.invalid')),
      model: 'test',
      credential: { layer: 'official' },
    },
  ],
  fallback: false,
  retryPolicy: ADOPTION,
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'test.invalid/test', accepts: ['test.invalid/test'], foreignThinking: 'omit' },
  ],
  representation: ADOPTION,
  parameterAdoptions: [],
  source: ADOPTION,
}

const MEMBER: TenantStandingReading = Object.freeze({
  kind: 'member',
  role: { model: { model: 'default-team', revision: '1' }, role: 'member' },
  qualifications: [],
  evidence: { record: 'standing:fixture', revision: '1' },
})

const identityStandIn = defineRow({
  row: 'identity',
  implementation: 'contract-double',
  manifest: {
    provides: [tenantStandingKey, identityGovernanceKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'identity-stand-in',
    apply(ctx: Context) {
      class Standing extends TenantStandingSourceService {
        readonly read = ({ tenant }: { tenant: typeof TENANT }) =>
          Promise.resolve(
            tenantEquals(tenant, TENANT)
              ? MEMBER
              : {
                  kind: 'not-member' as const,
                  evidence: { record: 'standing:other', revision: '0' },
                },
          )
      }
      new Standing(ctx)
      ctx.provide(identityGovernanceKey, {
        queryCurrentTenant: () => Promise.reject(new Error('identityGovernance is not asked')),
      })
    },
  },
})

const workPrincipal: EntryObjectModule = {
  name: WORK_KEY,
  implementation: 'contract-double',
  install(scope, env) {
    const issued = sessionWorkIssuerOf(env)({ tenant: TENANT, session: 's'.repeat(64) })
    if ('failure' in issued) throw new Error('fixture: the work principal was refused')
    scope.provide(WORK_KEY, issued.ok)
  },
}

const entryObjects = [
  principalVerifier,
  principalIssuer,
  workPrincipal,
  storageHost,
  cursorSigning,
  modelClock,
  modelHostAuthority,
  identityClock,
]

function rowsOf(storageRoot: string) {
  const model = modelRowsOperatorConfig({ storageRoot })
  return [
    { id: 'storage', plugin: 'storageRow', config: providerConfig(storageRoot) },
    { id: 'identity', plugin: 'identityStandIn' },
    {
      id: 'authorization',
      plugin: 'authorization',
      config: {
        actionRules: {
          revision: 'test-1',
          rules: [{ id: 'files', effect: 'allow', tool: 'Files' }],
        },
      },
    },
    {
      id: 'session-storage',
      plugin: 'sessionStorageRow',
      config: {
        combinationVersion: COMBINATION_VERSION,
        directoryFile: join(storageRoot, 'tenant-domains.json'),
        domainRule: 'organization-account/1',
      },
    },
    { id: 'model-tokenizers', plugin: 'modelTokenizersRow', config: LOCAL_TOKENIZERS },
    { id: 'model-profiles', plugin: 'modelProfilesRow', config: model.profiles },
    {
      id: 'model-request-preparation',
      plugin: 'modelRequestPreparationRow',
      config: model.preparation,
    },
    { id: 'model-records', plugin: 'modelRecordsRow', config: model.records },
    { id: 'model-host', plugin: 'modelHostRow', config: model.host },
  ]
}

function pluginsWith(host: unknown) {
  return {
    modelTokenizersRow,
    stubPlugin,
    storageRow,
    identityStandIn,
    authorization,
    sessionStorageRow,
    modelProfilesRow,
    modelRequestPreparationRow,
    modelRecordsRow,
    modelHostRow: host,
  }
}

async function contactOn(storageRoot: string, host: unknown, admit: boolean) {
  const { value } = await withLiveRows(
    {
      rows: rowsOf(storageRoot),
      plugins: pluginsWith(host),
      entryObjects,
      probe: [modelRuntimeKey, WORK_KEY],
    },
    async ctx => {
      const runtime = ctx.get(modelRuntimeKey) as ModelRuntime<unknown>
      const work = ctx.get(WORK_KEY) as Principal
      if (admit)
        must(
          await runtime.calls.admit({
            principal: work,
            tenant: TENANT,
            call: CALL,
            operation: ADMISSION,
            request: REQUEST,
            consumer: { owner: '@omne-harness/agent', work: 'w', position: 'p', purpose: 'main' },
          }),
        )
      return runtime.calls.contact({ principal: work, tenant: TENANT, reference: REFERENCE })
    },
  )
  return value
}

it(
  'answers lost with the evidence of the state lock for a call an earlier tree admitted',
  { timeout: 120_000 },
  async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-lost-')))
    bases.push(base)
    const storageRoot = join(base, 'storage')
    await contactOn(storageRoot, modelHostRow, false)
    const tenantText = tenantCodec.encode(TENANT)
    if (!tenantText.ok) throw new Error('fixture tenant')
    writeFileSync(
      join(storageRoot, 'tenant-domains.json'),
      `${JSON.stringify({
        format: 'tenant-domain-directory/1',
        domainRule: 'organization-account/1',
        tenants: [tenantText.value],
      })}\n`,
    )
    const before = await contactOn(storageRoot, modelHostRow, true)
    const taken = acquireStateLock(base)
    if (taken.kind !== 'held') throw new Error('fixture: the state lock is in use')
    locks.push(taken.lock)
    const judged = createModelHostRow({ lostContact: lostContactBy(() => taken.lock, 'call') })
    const after = await contactOn(storageRoot, judged, false)
    const unjudged = await contactOn(storageRoot, modelHostRow, false)
    expect(before).toEqual({ ok: { kind: 'holding' } })
    expect(after).toEqual({
      ok: {
        kind: 'lost',
        evidence: {
          owner: '@omne-harness/harness-server',
          record: 'state-lock',
          revision: taken.lock.since,
          digest: `call:${CALL}`,
        },
      },
    })
    expect(unjudged).toEqual({ ok: { kind: 'unknown' } })
  },
)
