import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { readJsonText } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { attachSkillsAccess, createSkillsAuthor } from '@omne-harness/tool-definitions'
import { SEARCH_RANKING } from '../../src/entry/search-ranking.ts'
import {
  principalIssuer,
  principalVerifier,
  sessionWorkIssuerOf,
} from '../../src/entry/principals.ts'
import {
  routedSkills,
  tenantSkills,
  TenantSkillsHost,
  type OfficialSkillPorts,
} from '../../src/rows/skills/tenant-skills.ts'
import { skillCategoryPlugin } from '@omne-harness/skill-host-local/cordis'
import { openTenantAssets, TenantAssetsHost } from '../../src/rows/tenant-assets/host.ts'
import { heldRegistry } from '../support/held-registry.ts'
import { createBoundSkills } from '../../src/rows/tool-bindings/skills.ts'
import { productionStorageCatalog } from '../../src/rows/storage/production-catalog.ts'
import { fixtureEnv, fixtureTenant } from '../entry/support.ts'
import { providerConfig } from '../rows/storage/fixtures/tree.ts'
import { openSkillPublisher, readWorkNowhere, writeSampleSkill } from './support.ts'

const NO_OFFICIAL: OfficialSkillPorts = { assets: () => [], directoryOf: () => undefined }
const NO_WORKSPACE = { sources: () => undefined, contractOf: () => undefined }

/** One tenant's Skills on real sqlite, called through the Skills author and its binding. */
export type SkillsWorld = Readonly<{
  publish(name: string, description?: string): Promise<void>
  call(command: string, params: object): Promise<string>
  /** Reads and queries the Skill set has sent to storage so far. */
  reads(): number
  close(): Promise<void>
}>

const LIMITS = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 32,
  maxStringLength: 4096,
  maxNumberLength: 32,
}

function counted(storage: SqlStorage): { storage: SqlStorage; reads(): number } {
  let reads = 0
  return {
    storage: {
      database: storage.database,
      registerCombination: input => storage.registerCombination(input),
      commit: (input, options) => storage.commit(input, options),
      query: identity => {
        reads += 1
        return storage.query(identity)
      },
      read: (input, options) => {
        reads += 1
        return storage.read(input, options)
      },
    },
    reads: () => reads,
  }
}

export async function skillsWorld(): Promise<SkillsWorld> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'skills-world-')))
  const tenant = fixtureTenant('a')
  const key = tenantCodec.encode(tenant)
  if (!key.ok) throw new Error('tenant')
  const domain = {
    scope: { kind: 'tenant' as const, tenant: key.value },
    transactionDomain: 'skills-world',
  }
  const materials = await productionStorageCatalog()
  const made = await createSqliteStorage({
    config: providerConfig(join(root, 'storage'), {
      maxWorkers: 2,
      reservedWriterSlots: 1,
      maxReadWorkersPerDomain: 1,
    }),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const packageRoot = join(root, 'assets')
  const publisher = await openSkillPublisher({
    storage: made.storage,
    materials,
    domain,
    packageRoot,
  })
  const counter = counted(made.storage)
  const registry = await heldRegistry([skillCategoryPlugin])
  const tenantAssets = new TenantAssetsHost({
    domains: { lookup: async () => ({ kind: 'ready', domain }) },
    open: where =>
      openTenantAssets(
        {
          storage: counter.storage,
          materials,
          packageRoot,
          categories: registry.categories,
          heldOf: registry.held.heldOf,
        },
        where,
      ),
  })
  const sourcesOf = registry.held.sourcesOf(ref => tenantAssets.open(ref))
  const host = new TenantSkillsHost({
    async open(who, tenantRef) {
      const assets = await tenantAssets.open(tenantRef)
      return assets === undefined
        ? undefined
        : tenantSkills(assets, who, SEARCH_RANKING, NO_WORKSPACE, sourcesOf(tenantRef), NO_OFFICIAL)
    },
  })

  const fixture = fixtureEnv([principalIssuerKey])
  await fixture.install(principalVerifier)
  await fixture.install(principalIssuer)
  const issued = sessionWorkIssuerOf(fixture.env)({ tenant, session: 'skills-world' })
  if (!('ok' in issued)) throw new Error('principal')
  const routed = routedSkills(host)
  const bound = createBoundSkills(
    { principal: issued.ok, tenant, request: {} as FixedToolRequest } as never,
    {
      verifier: () => fixture.root.get('principalVerifier'),
      readWork: readWorkNowhere,
      catalog: () => routed.catalog,
      access: () => routed.access,
      missingTools: async () => new Set(),
    },
  )
  const settings = readJsonText(JSON.stringify({ resultMaxBytes: 65536 }), LIMITS)
  if (settings.kind !== 'ok') throw new Error('settings')
  const author = createSkillsAuthor(settings.value)
  if ('failure' in author) throw new Error(JSON.stringify(author.failure))
  const registration = readToolRegistration(author.ok)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const operations = registration.operations

  return {
    async publish(name, description) {
      await publisher.publish(
        await writeSampleSkill(join(root, 'sources'), name, description),
        name,
      )
    },
    async call(command, params) {
      const operation = operations.find(([named]) => named === command)?.[1]
      if (operation === undefined || operation.author.kind !== 'ordinary') throw new Error(command)
      const text = JSON.stringify(params)
      const parsed = operation.author.parameters.parse({
        original: text,
        effective: text,
        complete: true,
      })
      if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
      const scope = createIndependentToolScope({
        limits: {
          authorBufferBytes: 65536,
          authorBufferItems: 100,
          authorWaitHistoryBytes: 65536,
          authorWaitHistoryItems: 100,
        },
        signal: new AbortController().signal,
        process: null,
        waits: null,
      })
      if ('failure' in scope) throw new Error(JSON.stringify(scope.failure))
      const result = await executeTool(
        parsed.ok,
        operation.author.executor,
        null,
        attachSkillsAccess(scope.ok, bound),
      )
      if ('failure' in result || typeof result.ok !== 'string')
        throw new Error(JSON.stringify(result))
      return result.ok
    },
    reads: counter.reads,
    async close() {
      await publisher.close()
      host.close()
      await tenantAssets.close()
      await made.control.close({ initiator: 'disposal' })
      rmSync(root, { recursive: true, force: true })
    },
  }
}
