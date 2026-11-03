// The `model-records` and `model-host` rows on the real storage rows (B3-M, `tmp/wire-model/design.md`):
// real SQLite storage, the real `session-storage`, `authorization`, `model-profiles`,
// `model-request-preparation` and `model-credential` rows, the release entry objects, and the
// real records plugin of model-storage-sql with the real send stage of model-host-local as its
// child. Stand-ins, each named: the `identity` row is a contract double whose `tenantStanding`
// answers `member` for the fixture tenant (the real one needs a registered account); the W of the
// tests is issued by the entry's own session work issuer through a test entry object, because the
// release `sessionWorkPrincipals` needs a session binding that no session of these tests creates.
// No network: nothing is admitted, so the send path opens nothing beyond its pool.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { Principal, TenantStandingReading } from '@omne-harness/identity'
import { TenantStandingSourceService, tenantStandingKey } from '@omne-harness/identity/cordis'
import { tenantEquals } from '@omne-harness/legal-identity'
import { decodeModelCallId, decodeModelOperationId } from '@omne-harness/model-contract'
import type { ModelRuntime } from '@omne-harness/model-contract'
import type { ModelHostAuthority } from '@omne-harness/model-contract/provider'
import {
  ModelCommandsService,
  ModelRuntimeService,
  ModelSendBoundaryService,
  modelCommandsKey,
  modelHostAuthorityKey,
  modelRuntimeKey,
  modelSendBoundaryKey,
} from '@omne-harness/model-cordis-contract/cordis'
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
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { authorization } from '../../../src/rows/authorization/row.ts'
import { lateBoundSendBoundary, modelHostRow } from '../../../src/rows/model-host/index.ts'
import { modelCredentialRow } from '../../../src/rows/model-credential/index.ts'
import { modelProfilesRow } from '../../../src/rows/model-profiles/index.ts'
import { modelRecordsRow } from '../../../src/rows/model-records/index.ts'
import { modelRequestPreparationRow } from '../../../src/rows/model-request-preparation/index.ts'
import { sessionStorageRow } from '../../../src/rows/session-storage/index.ts'
import { storageRow } from '../../../src/rows/storage/index.ts'
import type { EntryObjectModule } from '../../../src/types.ts'
import { modelRowsOperatorConfig } from '../../r9/support.ts'
import { providerConfig } from '../storage/fixtures/tree.ts'
import { TENANT, withLiveRows } from './support.ts'

const bases: string[] = []
afterEach(() => {
  for (const base of bases.splice(0)) rmSync(base, { recursive: true, force: true })
})

const WORK_KEY = 'testWorkPrincipal'
const CALL = decodeModelCallId('mcall_nobody')
const ADMISSION = decodeModelOperationId('mop_admit_nobody')
if (!('ok' in CALL) || !('ok' in ADMISSION)) throw new Error('fixture identities')

const MEMBER: TenantStandingReading = Object.freeze({
  kind: 'member',
  role: { model: { model: 'default-team', revision: '1' }, role: 'member' },
  qualifications: [],
  evidence: { record: 'standing:fixture', revision: '1' },
})

/** Stands for the `identity` row: the standing of the fixture tenant is `member`, every other tenant is not. */
const identityStandIn = defineRow({
  row: 'identity',
  implementation: 'contract-double',
  manifest: { provides: [tenantStandingKey], injects: [], sameProviderGroup: null },
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
    },
  },
})

/** A W of the fixture tenant, issued by the entry's own narrow session work issuer. */
const workPrincipal: EntryObjectModule = {
  name: WORK_KEY,
  implementation: 'contract-double',
  install(scope, env) {
    const issued = sessionWorkIssuerOf(env)({ tenant: TENANT, session: 's'.repeat(64) })
    if ('failure' in issued) throw new Error('fixture: the work principal was refused')
    scope.provide(WORK_KEY, issued.ok)
  },
}

function workspace() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'model-rows-')))
  bases.push(base)
  // The storage root must not exist yet: the entry creates it and the tenant directory (R2-D34).
  return { base, storageRoot: join(base, 'storage') }
}

const AUTHORIZATION = {
  actionRules: {
    revision: 'test-1',
    rules: [{ id: 'files', effect: 'allow', tool: 'Files' }],
  },
}

function rowsOf(storageRoot: string, options: { credential: boolean }) {
  const model = modelRowsOperatorConfig({ storageRoot })
  return [
    { id: 'storage', plugin: 'storageRow', config: providerConfig(storageRoot) },
    { id: 'identity', plugin: 'identityStandIn' },
    { id: 'authorization', plugin: 'authorization', config: AUTHORIZATION },
    {
      id: 'session-storage',
      plugin: 'sessionStorageRow',
      config: {
        combinationVersion: 'session-composite/3',
        directoryFile: join(storageRoot, 'tenant-domains.json'),
        domainRule: 'organization-account/1',
      },
    },
    { id: 'model-profiles', plugin: 'modelProfilesRow', config: model.profiles },
    {
      id: 'model-request-preparation',
      plugin: 'modelRequestPreparationRow',
      config: model.preparation,
    },
    ...(options.credential
      ? [{ id: 'model-credential', plugin: 'modelCredentialRow', config: model.credential }]
      : []),
    { id: 'model-records', plugin: 'modelRecordsRow', config: model.records },
    { id: 'model-host', plugin: 'modelHostRow', config: model.host },
  ]
}

const plugins = {
  stubPlugin,
  storageRow,
  identityStandIn,
  authorization,
  sessionStorageRow,
  modelProfilesRow,
  modelRequestPreparationRow,
  modelCredentialRow,
  modelRecordsRow,
  modelHostRow,
}
const entryObjects = [
  principalVerifier,
  principalIssuer,
  workPrincipal,
  storageHost,
  cursorSigning,
  modelClock,
  modelHostAuthority,
  // The `authorization` row injects it to judge the end time of a maintenance grant.
  identityClock,
]

describe('the model-records and model-host rows', () => {
  it('declare the table rows: records provides the commands and the send boundary; host is a business row', () => {
    expect(rowDeclarationOf(modelRecordsRow)).toMatchObject({
      row: 'model-records',
      implementation: 'real',
      manifest: {
        provides: [modelCommandsKey, modelSendBoundaryKey],
        injects: [
          'storage',
          'tenantDomainLookup',
          'modelClock',
          'principalVerifier',
          'tenantStanding',
        ],
        phase: null,
      },
    })
    expect(rowDeclarationOf(modelHostRow)).toMatchObject({
      row: 'model-host',
      implementation: 'real',
      manifest: { provides: ['modelRuntime', 'modelInstanceHost'], phase: 'business' },
      lifecycle: { kind: 'body', phase: 'business' },
    })
  })

  it(
    'load on the real storage with the credential row: commands, send boundary and runtime are the contract services; the host resolves and the W is admitted up to the record',
    { timeout: 60_000 },
    async () => {
      const { storageRoot } = workspace()
      const { value, run } = await withLiveRows(
        {
          rows: rowsOf(storageRoot, { credential: true }),
          plugins,
          entryObjects,
          probe: [
            modelCommandsKey,
            modelSendBoundaryKey,
            modelRuntimeKey,
            modelHostAuthorityKey,
            WORK_KEY,
          ],
        },
        async ctx => {
          const commands: unknown = ctx.get(modelCommandsKey)
          const boundary: unknown = ctx.get(modelSendBoundaryKey)
          const runtime = ctx.get(modelRuntimeKey) as ModelRuntime<unknown>
          const host = ctx.get(modelHostAuthorityKey) as ModelHostAuthority<unknown>
          const work = ctx.get(WORK_KEY) as Principal
          // Through the runtime (the W admission point): qualified, authorized, then not found.
          const seen = await runtime.calls.dispatches({
            principal: work,
            tenant: TENANT,
            call: CALL.ok,
          })
          // An unverified principal through the same point: denied before any read.
          const denied = await runtime.calls.dispatches({
            principal: structuredClone(work),
            tenant: TENANT,
            call: CALL.ok,
          })
          // Directly on the commands service there is no admission point: unavailable, never ok.
          const direct = await (commands as ModelCommandsService<unknown>).recall({
            principal: work,
            tenant: TENANT,
            call: CALL.ok,
            admission: ADMISSION.ok,
          })
          // The host authority reads the acceptance of a call nobody admitted.
          const resolved = await host.resolve({ tenant: TENANT, call: CALL.ok })
          return {
            commands: commands instanceof ModelCommandsService,
            boundary: boundary instanceof ModelSendBoundaryService,
            runtime: runtime instanceof ModelRuntimeService,
            seen,
            denied,
            direct,
            resolved,
          }
        },
      )
      expect(run.result.exitCode).toBe(0)
      expect(run.state('model-records')).toMatchObject({ state: 'ACTIVE' })
      expect(run.state('model-host')).toMatchObject({ state: 'ACTIVE' })
      expect(value.commands).toBe(true)
      expect(value.boundary).toBe(true)
      expect(value.runtime).toBe(true)
      expect(value.seen).toEqual({
        failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
      })
      expect(value.denied).toEqual({ failure: { kind: 'denied', action: 'account' } })
      expect(value.direct).toMatchObject({
        failure: { kind: 'unavailable', dependency: 'model-access-qualification' },
      })
      expect(value.resolved).toEqual({
        failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
      })
      const report = run.of('shutdown-result')[0]
      expect(report).toMatchObject({ overall: 'settled' })
      expect(report?.['outcomes']).toContainEqual({
        row: 'model-host',
        phase: 'business',
        result: { kind: 'settled' },
      })
    },
  )

  it(
    'without the operator configuration of the credential row, the send child waits and the host answers unavailable, never another source',
    { timeout: 60_000 },
    async () => {
      const { storageRoot } = workspace()
      const { value, run } = await withLiveRows(
        {
          rows: rowsOf(storageRoot, { credential: false }),
          plugins,
          entryObjects,
          probe: [modelCommandsKey, modelRuntimeKey],
        },
        async ctx => {
          const boundary: unknown = ctx.get(modelSendBoundaryKey)
          const sent = await lateBoundSendBoundary(ctx).send(
            { principal: 'nobody', tenant: TENANT, call: CALL.ok } as never,
            new AbortController().signal,
          )
          return { boundary, sent }
        },
      )
      expect(run.result.exitCode).toBe(0)
      expect(run.state('model-records')).toMatchObject({ state: 'ACTIVE' })
      expect(run.state('model-host')).toMatchObject({ state: 'ACTIVE' })
      expect(value.boundary).toBeUndefined()
      expect(value.sent).toEqual({
        kind: 'not-started',
        failure: {
          kind: 'unavailable',
          dependency: modelSendBoundaryKey,
          diagnostic: 'send boundary is not provided',
        },
      })
    },
  )

  it(
    'without the modelHostAuthority entry object both rows fail closed: no commands are provided',
    { timeout: 60_000 },
    async () => {
      const { storageRoot } = workspace()
      const { run } = await withLiveRows(
        {
          rows: rowsOf(storageRoot, { credential: true }),
          plugins,
          entryObjects: entryObjects.filter(module => module.name !== modelHostAuthorityKey),
          probe: [modelCommandsKey],
        },
        () => undefined,
      ).catch(error => ({ run: undefined, error }))
      // The probe never runs: the records row FAILED and the host stays PENDING on it.
      expect(run).toBeUndefined()
    },
  )
})
