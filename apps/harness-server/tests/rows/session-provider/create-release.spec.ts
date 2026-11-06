// @module-tag slow
// R2-D7: the first `create` of a tenant over the release rows of the Session path. Real rows:
// `storage`, `session-storage`, `agent-adoptions` (the mapping of `config/serve.distribution.json`),
// `adoption-sources`, `session-ad10`, `runtime-context`, `session-ad12` and `session-provider`, on
// the real entry objects (`runtimeContextTrust`, the two evidence sources, the principals and the
// clock). The doubles are the ones the release path does not decide here: the authorization policy
// and the identity bridge (`session-ad09`), which lets the test principal through. The creation is
// built as `server-entry` builds it, through `definitionResolverOf` over the same table. The session
// is in SQLite: a tree started again over the same storage reads it back. A creation that the mapping
// does not hold is `invalid` and creates nothing.
//
// The `coding` definition names Files, Shell, Tools and TodoItems as resident tools. Its cases
// add the real Tool rows `tool-bindings`, `tool-host` (with the operator construction of the tests)
// and `tool-residency` on the release entry objects, with the local operator's storage configuration.
// Without the Tool rows the creation fails closed and creates nothing.
// Slow: a real SQLite tree per case.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { definitionResolverOf } from '@omne-harness/server-entry/cordis'
import type {
  SessionCommand,
  SessionCreation,
  SessionIdentityBridge,
} from '@omne-harness/session-contract'
import {
  createScriptedSessionIdentityBridge,
  operationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import {
  SessionIdentityBridgeService,
  sessionIdentityKey,
  sessionKey,
  type SessionService,
} from '@omne-harness/session-cordis-contract/cordis'
import { toolGenerationsKey, type ToolGenerations } from '@omne-harness/tool-cordis-contract/cordis'
import { runtimeContextTrust } from '../../../src/entry/runtime-context-trust.ts'
import {
  TOOL_RELEASE_REGISTRANT_KEY,
  toolContributionAuthority,
  toolReleaseRegistrant,
  type ToolReleaseRegistrant,
} from '../../../src/entry/tool-release.ts'
import { toolResidencyPrincipal } from '../../../src/entry/tool-residency-principal.ts'
import { localOperatorLayer } from '../../../src/local/operator-defaults.ts'
import { sessionClock } from '../../../src/entry/session-clock.ts'
import {
  sessionCustodySource,
  sessionProductionSource,
} from '../../../src/entry/session-evidence-sources.ts'
import type { RowSpec } from '../../../src/loader.ts'
import { defineRow } from '../../../src/row.ts'
import { adoptionSourcesRow } from '../../../src/rows/adoption-sources/index.ts'
import { agentAdoptionsConfig } from '../../../src/rows/agent-adoptions/config.ts'
import { agentAdoptionsRow } from '../../../src/rows/agent-adoptions/index.ts'
import { buildTable } from '../../../src/rows/agent-adoptions/table.ts'
import { runtimeContextRow } from '../../../src/rows/runtime-context/index.ts'
import { sessionAd10Row } from '../../../src/rows/session-ad10/index.ts'
import { sessionAd12Row } from '../../../src/rows/session-ad12/index.ts'
import { sessionProviderRealRow } from '../../../src/rows/session-provider/real.ts'
import { storageRow } from '../../../src/rows/storage/index.ts'
import { toolBindingsRow } from '../../../src/rows/tool-bindings/index.ts'
import { toolHostRow } from '../../../src/rows/tool-host/index.ts'
import { toolResidencyRow } from '../../../src/rows/tool-residency/index.ts'
import { TEST_CONSTRUCTION, authorityOf, formalManifest } from '../tool-host/support.ts'
import {
  BASE_ENTRY_OBJECTS,
  declared,
  loadTree,
  makeBase,
  storageRows,
  type Base,
  type LoadedTree,
} from '../session-fixtures/tree.ts'
import { disabledTelemetryRow } from '../telemetry/support.ts'
import { TENANT_A } from '../storage/fixtures/tree.ts'

type CreateCommand = Extract<SessionCommand, { kind: 'create' }>
type Distribution = Readonly<{ rows: readonly Readonly<{ id: string; config: unknown }>[] }>
const residentNames = ['Files', 'Shell', 'Tools', 'TodoItems']
const releaseDistribution = JSON.parse(
  readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
) as Distribution

/** The `agent-adoptions` configuration of the release distribution. */
const releaseMapping = (() => {
  const row = releaseDistribution.rows.find(item => item.id === 'agent-adoptions')
  if (row === undefined) throw new Error('the release distribution has no agent-adoptions row')
  return row.config
})()

/** The identity bridge double that lets the test principal through (the release's is real). */
function identityDouble(): RowSpec {
  return declared(
    defineRow({
      row: 'session-ad09',
      implementation: 'contract-double',
      manifest: { provides: [sessionIdentityKey], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'session-ad09-double',
        apply(ctx: Context) {
          const scripted = createScriptedSessionIdentityBridge<unknown>('allow')
          class Identity extends SessionIdentityBridgeService<unknown> {
            readonly prepare: SessionIdentityBridge<unknown>['prepare'] = (input, command) =>
              scripted.prepare(input, command)
          }
          new Identity(ctx)
        },
      },
    }),
  )
}

const live: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const release of live.splice(0).reverse()) await release()
})

/** `tools: 'release'` adds the real Tool rows and the release entry objects of the tool path. */
async function start(base: Base, tools: 'none' | 'release' = 'none'): Promise<LoadedTree> {
  const release = tools === 'release'
  const local = localOperatorLayer({
    distribution: releaseDistribution,
    locations: {
      storageRoot: base.storageRoot,
      vaultFile: `${base.stateRoot}/vault`,
      hostFilesDir: base.stateRoot,
    },
    settings: {
      version: 1,
      port: 8965,
      workspace: base.stateRoot,
      shell: '/bin/bash',
      shellEnvironment: {},
    },
    platform: 'linux',
    shutdownDeadlineMs: 10_000,
  })
  const storage = local.ops.find(operation => operation.id === 'storage')
  if (storage === undefined) throw new Error('the local operator has no storage configuration')
  const tree = await loadTree({
    base,
    rows: [
      disabledTelemetryRow(),
      ...storageRows(base).specs.map(spec =>
        spec.row.id === 'storage' ? declared(storageRow, storage.config) : spec,
      ),
      identityDouble(),
      declared(agentAdoptionsRow, releaseMapping),
      declared(adoptionSourcesRow),
      declared(sessionAd10Row),
      declared(runtimeContextRow),
      declared(sessionAd12Row),
      declared(sessionProviderRealRow, { admission: 'none' }),
      ...(release
        ? [
            declared(toolBindingsRow),
            declared(toolHostRow, { construction: TEST_CONSTRUCTION }),
            declared(toolResidencyRow, { pageSize: 100 }),
          ]
        : []),
    ],
    entryObjects: [
      ...BASE_ENTRY_OBJECTS,
      sessionClock,
      runtimeContextTrust,
      sessionProductionSource,
      sessionCustodySource,
      ...(release
        ? [toolResidencyPrincipal, toolReleaseRegistrant, toolContributionAuthority]
        : []),
    ],
  })
  live.push(() => tree.dispose())
  return tree
}

function faces(tree: LoadedTree, caller: 'intake' | 'coordinator'): SessionService<unknown> {
  const session: SessionService<unknown> | undefined = tree.root.intercept(sessionKey, {
    caller,
  }).session
  if (session === undefined) throw new Error('the tree provides no session')
  return session
}

/** The creation as `server-entry` builds it (`session.ts`, step 5) for a public definition name. */
async function releaseCreation(
  name: string,
  patch: Partial<SessionCreation> = {},
): Promise<SessionCreation> {
  const table = await buildTable(agentAdoptionsConfig.parse(releaseMapping))
  const resolved = definitionResolverOf(table.mappings)(name)
  if (resolved === undefined) throw new Error(`${name} is not in the release mapping`)
  return {
    definition: { name, candidate: resolved.candidate },
    execution: resolved.execution,
    requiredIdentities: resolved.requiredIdentities,
    purpose: 'r2-d7 first create',
    workspace: null,
    workspaceAttachment: null,
    modes: { kind: 'tenant-default', source: resolved.tenantDefaults },
    initial: null,
    entryContract: resolved.entryContract,
    ...(resolved.initialModelSelection === undefined
      ? {}
      : { initialModelSelection: resolved.initialModelSelection }),
    ...patch,
  }
}

async function loadReleaseAuthors(tree: LoadedTree): Promise<void> {
  const generations = tree.service<ToolGenerations<unknown, unknown, never>>(toolGenerationsKey)
  const registrant = tree.root.get(TOOL_RELEASE_REGISTRANT_KEY) as ToolReleaseRegistrant | undefined
  if (generations === undefined || registrant === undefined)
    throw new Error('the tree has no tool generations or no release registrant')
  const manifest = formalManifest()
  for (const name of residentNames) {
    const loaded = await generations.ensureLoaded({
      authority: authorityOf(manifest, name),
      access: registrant,
    })
    if (!('ok' in loaded)) throw new Error(`${name} did not load: ${JSON.stringify(loaded)}`)
  }
}

const SESSION = sessionId('release-first')
const access = { principal: 'tester', tenant: TENANT_A, session: SESSION }

function create(tree: LoadedTree, creation: SessionCreation, name = 'release-first') {
  const command: CreateCommand['input'] = {
    tenant: TENANT_A,
    session: sessionId(name),
    operation: operationId(`create-${name}`),
    creation,
  }
  return faces(tree, 'intake').management.create({ principal: 'tester', ...command })
}

describe('the first create of a tenant over the release rows of the Session path', () => {
  it(
    'every row is ACTIVE: the real evidence bridge is on the real adoption source and the two entry sources',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const tree = await start(base)
      expect(tree.allActive).toBe(true)
      for (const id of ['adoption-sources', 'session-ad10', 'session-ad12', 'session-provider'])
        expect(tree.state(id)).toMatchObject({ state: 'ACTIVE', missing: [] })
    },
  )

  it(
    '`create` of the release definition answers a receipt and a dormant session; a tree started again over the same storage reads it back',
    { timeout: 90_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const first = await start(base)
      const created = await create(first, await releaseCreation('assistant'))
      expect(created).toEqual({ ok: expect.anything() })
      if (!('ok' in created)) throw new Error('unreachable')
      expect(created.ok.receipt.operation).toBe(operationId('create-release-first'))
      expect(created.ok.state).toMatchObject({ session: SESSION, lifecycle: 'dormant' })
      await first.shutdown()

      const second = await start(base)
      expect(second.allActive).toBe(true)
      const read = await faces(second, 'coordinator').work.readWork(access)
      expect(read).toEqual({ ok: expect.anything() })
      if (!('ok' in read)) throw new Error('unreachable')
      expect(read.ok).toMatchObject({ session: SESSION, tenant: TENANT_A, lifecycle: 'dormant' })
    },
  )

  it(
    '`create` of the coding definition (R2-D124) saves the release model selection and reads back',
    { timeout: 90_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const tree = await start(base, 'release')
      await loadReleaseAuthors(tree)
      const creation = await releaseCreation('coding')
      expect(creation.initialModelSelection?.name).toBe('openai/gpt-6.1-sol')
      const created = await create(tree, creation, 'coding-first')
      expect(created).toEqual({ ok: expect.anything() })
      if (!('ok' in created)) throw new Error('unreachable')
      expect(created.ok.state).toMatchObject({
        session: sessionId('coding-first'),
        lifecycle: 'dormant',
      })
      const codingAccess = { ...access, session: sessionId('coding-first') }
      const read = await faces(tree, 'coordinator').work.readWork(codingAccess)
      expect(read).toMatchObject({ ok: { lifecycle: 'dormant', tenant: TENANT_A } })
      // `readModelSelection` is an intake or maintainer read (session `callers.ts`).
      const selection = await faces(tree, 'intake').work.readModelSelection(codingAccess)
      expect(selection).toMatchObject({ ok: { selection: { name: 'openai/gpt-6.1-sol' } } })
    },
  )

  it(
    '`create` of coding commits all four residents; J06 projects their release asset adoptions',
    { timeout: 90_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const tree = await start(base, 'release')
      expect(tree.allActive).toBe(true)
      await loadReleaseAuthors(tree)
      const created = await create(tree, await releaseCreation('coding'), 'coding-residents')
      expect(created).toEqual({ ok: expect.anything() })
      const read = await faces(tree, 'coordinator').work.readWork({
        ...access,
        session: sessionId('coding-residents'),
      })
      if (!('ok' in read)) throw new Error(`readWork: ${JSON.stringify(read)}`)
      const manifest = formalManifest()
      const adoptionOf = (name: string) => {
        const entry = manifest.entries.find(item => item.asset.name === name)
        if (entry === undefined) throw new Error(`no release entry ${name}`)
        return entry.asset.adoption
      }
      expect(read.ok.residents.map(resident => resident.capability)).toEqual(residentNames)
      // J06's projection (session-adapters `conditions.ts`): owner and digest of `admitted`,
      // the capability as the name, the version as the revision.
      const bindings = read.ok.residents.map(resident => ({
        owner: resident.admitted.owner,
        name: resident.capability,
        revision: resident.version,
        digest: resident.admitted.digest,
      }))
      expect(bindings).toEqual(residentNames.map(adoptionOf))
    },
  )

  it(
    '`create` of coding without the Tool rows fails closed with a diagnostic and creates nothing; assistant names no resident and still creates',
    { timeout: 90_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const tree = await start(base)
      const refused = await create(tree, await releaseCreation('coding'), 'coding-no-tools')
      expect(refused).toMatchObject({
        failure: {
          kind: 'unavailable',
          diagnostic: 'resident tools: tool release: no release contribution authority',
        },
      })
      const read = await faces(tree, 'coordinator').work.readWork({
        ...access,
        session: sessionId('coding-no-tools'),
      })
      expect('ok' in read).toBe(false)
      const assistant = await create(tree, await releaseCreation('assistant'), 'assistant-no-tools')
      expect(assistant).toEqual({ ok: expect.anything() })
    },
  )

  it(
    'a creation the mapping does not hold is invalid from the adoption source and creates nothing',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const tree = await start(base)
      const assistant = await releaseCreation('assistant')
      const unknownName = await create(
        tree,
        { ...assistant, definition: { ...assistant.definition, name: 'nobody' } },
        'unknown-name',
      )
      expect(unknownName).toMatchObject({ failure: { kind: 'invalid', field: 'definition' } })
      const otherCandidate = await create(
        tree,
        {
          ...assistant,
          definition: {
            ...assistant.definition,
            candidate: { ...assistant.definition.candidate, revision: '2' },
          },
        },
        'other-candidate',
      )
      expect(otherCandidate).toMatchObject({
        failure: { kind: 'invalid', field: 'definition.candidate' },
      })
      const read = await faces(tree, 'coordinator').work.readWork({
        ...access,
        session: sessionId('unknown-name'),
      })
      expect('ok' in read).toBe(false)
    },
  )
})
