// The world of CP2, shared by the checkpoint test and its child process. Real: the sqlite-provider
// on the files under `root` (real write Worker, read Workers and files), the Session storage port of
// session-storage-sql, and the `agentJournal` plugin `SessionLogAgentJournalProvider` on a real
// Cordis 4.0.4 root, which routes by tenant and execution to `createSessionLogJournal`. Doubles: the
// three keys the plugin injects are test service classes: `storage` forwards to the real storage and
// counts its commits, `tenantDomainLookup` knows the two registered tenants only, and
// `sessionAccessCheck` allows every request. The Session domain resolution and cursor signing of the
// storage port are the doubles of session-contract and session-cordis-contract.
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import {
  decodeAgentExecutionId,
  decodeInputId,
  type AcceptedInput,
  type AgentExecutionId,
  type AgentJournal,
  type ExecutionSnapshot,
} from '@omne-harness/agent-contract'
import { agentJournalKey } from '@omne-harness/agent-cordis-contract/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  SessionAccess,
  SessionAccessDecision,
  SessionAccessRequest,
  SessionCommand,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  assistantMessage,
  creation,
  evidence,
  guard,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import { SessionAccessCheckService } from '@omne-harness/session-cordis-contract/cordis'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import { createSessionStorage, sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import {
  EXECUTION_RECORD_HANDLERS,
  EXECUTION_RECORD_PROTOCOL,
  SESSION_HISTORY_ROOT_HANDLER,
  SESSION_LOG_PARTICIPANTS,
  SESSION_PROTOCOL,
  decodeExecutionRecordState,
  decodeSessionHistoryRoot,
} from '@omne-harness/session-storage-sql/participants'
import {
  combinationManifest,
  manifestDigest,
  type CommitResultV2,
  type DomainRef,
  type SqlMaterialCatalog,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { StorageService, TenantDomainLookupService } from '@omne-harness/sql-contract/cordis'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { SessionLogAgentJournalProvider } from '../../src/cordis/agent-journal-provider.ts'
import { checkpoint, instance, ok, openInput, operation } from './common-journal.ts'
import { realConfig } from './sql-real-config.ts'

const COMBINATION = 'c1'
/** The session of the checkpoint; the same name in the test and in the child. */
export const CP2_SESSION = 'cp2-session'

export const own = memoryAccess('tester', CP2_SESSION)
export const other = memoryOtherAccess('intruder', CP2_SESSION)

export function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('unminted tenant')
  return encoded.value
}

const OWN_TENANT = textOf(own.tenant)
const OTHER_TENANT = textOf(other.tenant)
const domains: Readonly<Record<'own' | 'other', DomainRef>> = {
  own: { scope: { kind: 'tenant', tenant: OWN_TENANT }, transactionDomain: 'dom_0' },
  other: { scope: { kind: 'tenant', tenant: OTHER_TENANT }, transactionDomain: 'dom_1' },
}

function catalogOf(): { catalog: SqlMaterialCatalog; digest: string } {
  const materials = sessionStorageMaterials()
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: materials.participants,
    migrations: materials.migrations,
    readHandlers: materials.readHandlers,
    declaredCombinations: {
      tenant: { combinationVersion: COMBINATION, participants: [...SESSION_LOG_PARTICIPANTS] },
      system: null,
    },
  }
  const manifest = combinationManifest({ catalog, participants: [...SESSION_LOG_PARTICIPANTS] })
  if (manifest.kind !== 'manifest') throw new Error(`combination is ${manifest.kind}`)
  return { catalog, digest: manifestDigest(manifest.manifest) }
}

/** One storage commit as the storage saw it: the participants of its commands and its answer. */
export type SeenCommit = Readonly<{ participants: readonly string[]; result: CommitResultV2 }>

/**
 * Opens the real provider on `root` (a new directory or the one of an earlier process), registers
 * both tenants' domains, and mounts the plugin on a new Cordis root.
 */
export async function openCp2(root: string) {
  const { catalog, digest } = catalogOf()
  const created = await createSqliteStorage({
    config: realConfig(join(root, 'storage')),
    materials: catalog,
    closeLeases: { admit: name => ({ name }), release: () => undefined },
  })
  if (created.kind !== 'created') throw new Error(`provider rejected: ${created.reason}`)
  const real = created.storage
  const combination = { combinationVersion: COMBINATION, manifestDigest: digest }
  for (const domain of Object.values(domains)) {
    const registered = await real.registerCombination({
      ...domain,
      ...combination,
      participants: [...SESSION_LOG_PARTICIPANTS],
    })
    if (registered.kind !== 'registered') throw new Error(`registration ${registered.kind}`)
  }

  const commits: SeenCommit[] = []
  const storage: SqlStorage = {
    registerCombination: input => real.registerCombination(input),
    commit: async (request, options) => {
      const result = await real.commit(request, options)
      commits.push({ participants: request.commands.map(item => item.participant), result })
      return result
    },
    query: identity => real.query(identity),
    read: (request, options) => real.read(request, options),
  }
  const lookup: TenantDomainLookup['lookup'] = input =>
    Promise.resolve(
      input.tenant === OWN_TENANT
        ? { kind: 'ready', domain: domains.own }
        : input.tenant === OTHER_TENANT
          ? { kind: 'ready', domain: domains.other }
          : { kind: 'unregistered' },
    )
  class Storage extends StorageService {
    readonly registerCombination = storage.registerCombination
    readonly commit = storage.commit
    readonly query = storage.query
    readonly read = storage.read
  }
  class Lookup extends TenantDomainLookupService {
    readonly lookup = lookup
  }
  class Access extends SessionAccessCheckService<unknown> {
    readonly check = (request: SessionAccessRequest<unknown>): Promise<SessionAccessDecision> =>
      Promise.resolve({ kind: 'allowed', evidence: evidence(`access/${request.operation}`) })
  }

  const port = createSessionStorage<string>({
    storage,
    domains: {
      resolve: input =>
        Promise.resolve(
          input.tenant === OWN_TENANT
            ? { kind: 'ready', entry: { tenant: input.tenant, domain: domains.own } }
            : { kind: 'unavailable', diagnostic: 'no domain' },
        ),
      snapshot: () =>
        Promise.resolve({
          kind: 'ready',
          value: {
            revision: '1',
            entries: [{ tenant: OWN_TENANT, domain: domains.own }],
          },
        }),
    },
    accessCheck: {
      check: request =>
        Promise.resolve({ kind: 'allowed', evidence: evidence(`session/${request.operation}`) }),
    },
    cursorSigning: createFixedSessionCursorSigning(),
    combination,
  })

  const ctx = new Context()
  for (const plugin of [Storage, Lookup, Access]) await ctx.plugin(plugin)
  const fiber = await ctx.plugin(SessionLogAgentJournalProvider, combination)
  const journal = (): AgentJournal<string> => {
    const found = ctx.get(agentJournalKey)
    if (found === undefined) throw new Error('agentJournal is not provided')
    return found as AgentJournal<string>
  }

  /** The Agent publication count and the Session common root, read on the real read Workers. */
  async function published(): Promise<{ agent: string; session: string }> {
    const read = async (handler: string, protocol: string) => {
      const result = await real.read({
        domain: domains.own,
        handler,
        protocol,
        requestKey: `cp2-${handler}`,
        input: { tenant: OWN_TENANT, session: own.session },
      })
      if (result.kind !== 'read') throw new Error(`${handler}: ${result.kind}`)
      return result.output
    }
    const agent = decodeExecutionRecordState(
      await read(EXECUTION_RECORD_HANDLERS.state, EXECUTION_RECORD_PROTOCOL),
    )
    const root = decodeSessionHistoryRoot(
      await read(SESSION_HISTORY_ROOT_HANDLER, SESSION_PROTOCOL),
    )
    if (agent === null || root === null) throw new Error('the common root is not readable')
    return { agent: agent.published, session: root.published }
  }

  return {
    port,
    commits,
    journal,
    published,
    async sessionRevision(): Promise<string> {
      return ok(await port.readWork(own)).revision
    },
    async close(): Promise<void> {
      await fiber.dispose()
      await created.control.close({ initiator: 'disposal' }).catch(() => undefined)
    },
  }
}

export type Cp2World = Awaited<ReturnType<typeof openCp2>>

/**
 * Creates the session and starts its Run through the Session storage port: `startRun` writes the
 * execution index in the same commit. Returns the Run's execution and the Agent open request.
 */
export async function seedCp2(world: Cp2World) {
  const access: SessionAccess<string> = own
  const value = creation({ initial: ordinaryInput('input-1') })
  const create: SessionCommand = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('cp2-create'),
      creation: value,
    },
  }
  ok(
    await world.port.commit({
      access,
      command: create,
      guards: [
        initializationFixtureGuard(
          initializationFixtureFacts(create, null, adoptedInitializationFixture(create)),
        ),
      ],
    }),
  )
  const started = ok(
    await world.port.commit({
      access,
      command: {
        kind: 'startRun',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId('cp2-start'),
          entry: 'interactive',
          candidate: value.definition.candidate,
          instance: { owner: 'agent', id: 'instance-1' },
        },
      },
      guards: [
        guard('evidence-bridge', 'login-entry', { session: CP2_SESSION, operation: 'start' }),
      ],
    }),
  )
  const snapshot = ok(await world.port.readWork(access))
  if (snapshot.run.kind !== 'active') throw new Error('the Run is not active')
  const execution = ok(decodeAgentExecutionId(snapshot.run.execution.execution))
  const admitted = ok(await world.port.readInput({ ...access, input: snapshot.run.first }))
  const initial: AcceptedInput = {
    id: ok(decodeInputId(admitted.input)),
    content: admitted.message,
    source: admitted.origin,
    priority: 'ordinary',
  }
  return {
    execution,
    open: openInput({
      access,
      execution,
      operation: operation('cp2-open'),
      instance: instance(),
      grant: started.receipt.source,
      initial,
      checkpoint: checkpoint(),
    }),
  }
}

export type JournalCommitRequest = Parameters<AgentJournal<string>['commit']>[0]

/** The message commit after `loaded`: the first publication point of an assistant message. */
export function messageCommit(
  execution: AgentExecutionId,
  authority: JournalCommitRequest['authority'],
  loaded: ExecutionSnapshot,
): JournalCommitRequest {
  const message = assistantMessage('answer from the checkpoint')
  return {
    ...own,
    execution,
    operation: operation('cp2-message'),
    authority,
    expected: loaded.revision,
    checkpoint: loaded.checkpoint,
    state: { kind: 'advancing' },
    events: [{ kind: 'message', message, source: evidence('cp2-message-admission') }],
    effects: [],
    caller: {
      kind: 'message',
      message,
      source: evidence('cp2-message-source'),
      admission: evidence('cp2-message-admission'),
    },
    replyAdmission: null,
    handoff: null,
    finish: null,
  }
}
