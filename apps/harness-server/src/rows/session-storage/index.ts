// `session-storage` 行（装配页「会话存储组合」）：行体承载，阶段 `composition`。同一行体内构造租户到事务域的目录与
// `@omne-harness/session-storage-sql` 的纯端口，目录的存储构造能力只经闭包交给后者。提供五个键：
// `sessionTransactions`（公开端口）、`sessionDelegatedTransactions`（受信，委派视图）、`tenantDomains`（部署枚举）、
// `tenantDomainLookup`（受信，只读快照）、`sessionPrincipalBindings`（受信，会话归属读口）。
// 登记规则：session-storage-sql 在每次读与提交都 `resolve` 租户的域（XP-6），而目录的 `resolve` 只查快照；
// 只有访问裁定放行的 `create` 让本行登记该租户。公开端口在 `create` 提交前登记；委派视图绑定到一次放行的 `create`
// 时，视图解析该租户的域就登记（Session 核心先经视图 `queryOperation` 再提交，登记必须在第一次读之前）。
// 读与被拒的 `create` 不登记。
// 已知限制：换 `combinationVersion` 不会为已登记的租户补登记（登记表不记版本），换版本需要另有拥有者定补登记的时机。
// 游标签名按调用现取 `sessionCursorSigning`（IC-9），不在 inject 里；入口对象缺席时五种读答 `unavailable`。
import type { Context } from '@deepseek-ai/cordis'
import { referenceSystemActionAuthorization } from '@omne-harness/authorization'
import { principalVerifierKey } from '@omne-harness/identity/cordis'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  mutationAccessRequest,
  type SessionAccessCheck,
  type SessionAccessRequest,
  type SessionCheckedAccess,
  type SessionDelegatedTransactions,
  type SessionFailure,
  type SessionPrincipalBindingSource,
  type SessionTransactionPort,
} from '@omne-harness/session-contract'
import type { SessionCursorSigning } from '@omne-harness/session-cordis-contract'
import {
  SessionDelegatedTransactionsService,
  SessionPrincipalBindingsService,
  SessionTransactionPortService,
  sessionAccessCheckKey,
  sessionCursorSigningKey,
  sessionDelegatedTransactionsKey,
  sessionPrincipalBindingsKey,
  sessionTransactionsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { createSessionStorage, type SessionStorageOptions } from '@omne-harness/session-storage-sql'
import type {
  CombinationRegistrationV2,
  SqlStorage,
  TenantDomainAccess,
  TenantDomainLookup,
  TenantDomains,
} from '@omne-harness/sql-contract'
import {
  TenantDomainLookupService,
  TenantDomainsService,
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'
import { defineRow, type RowHandle } from '../../row.ts'
import { storageCatalog } from '../storage/catalog.ts'
import { releaseMaintenanceGrants } from '../authorization/grants.ts'
import { boundAccessCheck } from './bound.ts'
import { SESSION_COMPOSITE_PARTICIPANTS, compositeManifestDigest } from './composite.ts'
import { sessionStorageRowConfigSchema, type SessionStorageRowConfig } from './config.ts'
import { openTenantDirectory, type RegisterOutcome, type TenantDirectory } from './directory.ts'
import { createTenantEnumeration } from './enumeration.ts'

/** `SessionFailure.unavailable` 的拥有者。 */
export const OWNER = 'apps/harness-server/session-storage'

const unavailable = (diagnostic: string): Outcome<never, SessionFailure> =>
  fail<SessionFailure>({ kind: 'unavailable', owner: OWNER, diagnostic })

/** 按调用现取入口对象 `sessionCursorSigning`。缺席时答 `unavailable`。 */
function lateBoundCursorSigning(ctx: Context): SessionCursorSigning {
  const current = (): SessionCursorSigning | undefined => ctx.get(sessionCursorSigningKey)
  return {
    sign: payload => current()?.sign(payload) ?? Promise.resolve({ kind: 'unavailable' }),
    verify: input => current()?.verify(input) ?? Promise.resolve({ kind: 'unavailable' }),
  }
}

type RegisterEntry = Parameters<Parameters<typeof openTenantDirectory>[0]['register']>[0]

/** 向存储登记该租户的组合。结果 `unknown` 时用完全相同的输入认回一次（sql-contract §6.3）。 */
function registerWith(
  storage: SqlStorage,
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>,
): (entry: RegisterEntry) => Promise<RegisterOutcome> {
  return async entry => {
    const input: CombinationRegistrationV2 = {
      scope: entry.domain.scope,
      transactionDomain: entry.domain.transactionDomain,
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
      participants: [...SESSION_COMPOSITE_PARTICIPANTS],
    }
    let result = await storage.registerCombination(input)
    if (result.kind === 'unknown') result = await storage.registerCombination(input)
    switch (result.kind) {
      case 'registered':
        return { kind: 'registered' }
      case 'rejected_before_accept':
        return {
          kind: 'unavailable',
          diagnostic: `registration rejected: ${result.reason}${result.diagnostic === null || result.diagnostic === result.reason ? '' : ` (${result.diagnostic})`}`,
        }
      case 'unknown':
        return { kind: 'unavailable', diagnostic: 'registration outcome unknown after one retry' }
    }
  }
}

type CommitInput<P> = Parameters<SessionTransactionPort<P>['commit']>[0]

/**
 * 公开端口与委派视图共用的登记规则：`create` 提交、访问与命令指名同一租户和同一会话、目录快照里没有该租户、`authorize` 放行时，
 * 先登记（含迁移），再交给端口提交。其余调用原样交给端口。
 */
function registeringOnCreate<P>(
  port: SessionTransactionPort<P>,
  directory: TenantDirectory,
  authorize: (input: CommitInput<P>) => Promise<boolean>,
): SessionTransactionPort<P> {
  const commit = async (input: CommitInput<P>): Promise<Outcome<unknown, SessionFailure>> => {
    const { command, access } = input
    // 与 session-storage-sql 的第一道拒绝相同：访问与命令指名的租户或会话不一致时，交给端口拒绝，不登记。
    if (
      command.kind === 'create' &&
      tenantEquals(access.tenant, command.input.tenant) &&
      access.session === command.input.session
    ) {
      const text = tenantCodec.encode(command.input.tenant)
      if (text.ok && !directory.holds(text.value) && (await authorize(input))) {
        const registered = await directory.ensureRegistered(text.value)
        if (registered.kind === 'unavailable')
          return unavailable(`tenant domain registration: ${registered.diagnostic}`)
      }
    }
    return port.commit(input)
  }
  // 与 session-storage-sql 相同的写法：`commit` 的返回类型按命令种类分派，包装函数只能整体标注。
  return { ...port, commit: commit as SessionTransactionPort<P>['commit'] }
}

/**
 * 放行的 `create` 所绑定的租户文本：请求是 `create` 的变更请求，且访问与命令指名同一租户和同一会话（与
 * session-storage-sql 的第一道拒绝相同）。别的绑定，或租户、会话不一致的 `create`，给 `null`。
 */
function boundCreateTenant<P>(request: SessionAccessRequest<P>): string | null {
  if (request.operation !== 'create') return null
  const { command } = request.target
  if (
    !tenantEquals(request.access.tenant, command.input.tenant) ||
    request.target.session !== command.input.session
  )
    return null
  const text = tenantCodec.encode(command.input.tenant)
  return text.ok ? text.value : null
}

/**
 * 放行的 `create` 所绑定的视图看到的目录：解析这一个租户的域就登记（含迁移），其余租户照快照。Session 核心
 * 在提交前先经视图 `queryOperation`，而 session-storage-sql 每次读都 `resolve`，所以登记落在视图的第一次解析，
 * 不等到提交。登记失败时解析答 `unavailable`，session-storage-sql 把它作为该次调用的失败返回。
 */
function registeringAccess(directory: TenantDirectory, tenantText: string): TenantDomainAccess {
  return {
    ...directory.access,
    resolve: input =>
      input.tenant === tenantText
        ? directory.ensureRegistered(input.tenant)
        : directory.access.resolve(input),
  }
}

const DENIED_IN_VIEW = ['commitEntries', 'pending', 'references', 'releasedScopes'] as const

function delegatedView<P>(
  base: SessionStorageOptions<P>,
  directory: TenantDirectory,
  checked: SessionCheckedAccess<P>,
): SessionTransactionPort<P> {
  const creating = boundCreateTenant(checked.request)
  const view = createSessionStorage({
    ...base,
    ...(creating === null ? {} : { domains: registeringAccess(directory, creating) }),
    accessCheck: boundAccessCheck(checked),
  })
  const denied = (action: (typeof DENIED_IN_VIEW)[number]) => () =>
    Promise.resolve(fail<SessionFailure>({ kind: 'denied', action }))
  return {
    ...view,
    commitEntries: denied('commitEntries'),
    pending: denied('pending'),
    references: denied('references'),
    releasedScopes: denied('releasedScopes'),
  }
}

class SessionTransactionsImpl extends SessionTransactionPortService<unknown> {
  readonly commit: SessionTransactionPort<unknown>['commit']
  readonly readWork: SessionTransactionPort<unknown>['readWork']
  readonly readInput: SessionTransactionPort<unknown>['readInput']
  readonly queryOperation: SessionTransactionPort<unknown>['queryOperation']
  readonly queryControlOperation: SessionTransactionPort<unknown>['queryControlOperation']
  readonly readModelSelection: SessionTransactionPort<unknown>['readModelSelection']
  readonly commitEntries: SessionTransactionPort<unknown>['commitEntries']
  readonly history: SessionTransactionPort<unknown>['history']
  readonly pending: SessionTransactionPort<unknown>['pending']
  readonly references: SessionTransactionPort<unknown>['references']
  readonly releasedScopes: SessionTransactionPort<unknown>['releasedScopes']

  constructor(ctx: Context, port: SessionTransactionPort<unknown>) {
    super(ctx)
    this.commit = port.commit
    this.readWork = port.readWork
    this.readInput = port.readInput
    this.queryOperation = port.queryOperation
    this.queryControlOperation = port.queryControlOperation
    this.readModelSelection = port.readModelSelection
    this.commitEntries = port.commitEntries
    this.history = port.history
    this.pending = port.pending
    this.references = port.references
    this.releasedScopes = port.releasedScopes
  }
}

class DelegatedTransactionsImpl extends SessionDelegatedTransactionsService<unknown> {
  readonly bind: SessionDelegatedTransactions<unknown>['bind']
  constructor(ctx: Context, bind: SessionDelegatedTransactions<unknown>['bind']) {
    super(ctx)
    this.bind = bind
  }
}

class TenantDomainsImpl extends TenantDomainsService<unknown> {
  readonly enumerate: TenantDomains<unknown>['enumerate']
  constructor(ctx: Context, directory: TenantDomainAccess) {
    super(ctx)
    const authorization = referenceSystemActionAuthorization({
      verifier: {
        verify: principal =>
          ctx.get(principalVerifierKey)?.verify(principal) ??
          Promise.resolve({ kind: 'unavailable', diagnostic: 'principal verifier is unavailable' }),
      },
      grants: releaseMaintenanceGrants(),
      clock: null,
    })
    this.enumerate = createTenantEnumeration(authorization, directory).enumerate
  }
}

class TenantDomainLookupImpl extends TenantDomainLookupService {
  readonly lookup: TenantDomainLookup['lookup']
  constructor(ctx: Context, lookup: TenantDomainLookup) {
    super(ctx)
    this.lookup = input => lookup.lookup(input)
  }
}

/** 会话归属读口。session-storage-sql 没有受信的归属读路径（公开读都经访问裁定），所以答 `unavailable`（已知限制）。 */
class PrincipalBindingsImpl extends SessionPrincipalBindingsService {
  readonly read: SessionPrincipalBindingSource['read'] = () =>
    Promise.resolve(
      fail<Extract<SessionFailure, { kind: 'unavailable' }>>({
        kind: 'unavailable',
        owner: OWNER,
        diagnostic: 'session ownership read is not implemented in the session storage composite',
      }),
    )
}

async function body(ctx: Context, raw: unknown): Promise<RowHandle> {
  const config: SessionStorageRowConfig = sessionStorageRowConfigSchema.parse(raw)
  const storage: SqlStorage = ctx.storage
  const accessCheck: SessionAccessCheck<unknown> = ctx.sessionAccessCheck
  const manifest = compositeManifestDigest(storageCatalog())
  if (manifest.kind === 'invalid')
    throw new Error(`session storage composite is not registrable: ${manifest.diagnostic}`)
  const combination = {
    combinationVersion: config.combinationVersion,
    manifestDigest: manifest.digest,
  }
  const directory = openTenantDirectory({
    file: config.directoryFile,
    register: registerWith(storage, combination),
  })
  const base: SessionStorageOptions<unknown> = {
    storage,
    domains: directory.access,
    accessCheck,
    cursorSigning: lateBoundCursorSigning(ctx),
    combination,
  }
  const port = registeringOnCreate(
    createSessionStorage(base),
    directory,
    async input =>
      (await accessCheck.check(mutationAccessRequest(input.access, input.command))).kind ===
      'allowed',
  )
  new SessionTransactionsImpl(ctx, port)
  new DelegatedTransactionsImpl(ctx, checked => delegatedView(base, directory, checked))
  new TenantDomainsImpl(ctx, directory.access)
  new TenantDomainLookupImpl(ctx, directory.lookup)
  new PrincipalBindingsImpl(ctx)
  return { stop: deadline => directory.close(deadline) }
}

export const sessionStorageRow = defineRow({
  row: 'session-storage',
  implementation: 'real',
  manifest: {
    provides: [
      sessionTransactionsKey,
      sessionDelegatedTransactionsKey,
      tenantDomainsKey,
      tenantDomainLookupKey,
      sessionPrincipalBindingsKey,
    ],
    injects: [storageKey, sessionAccessCheckKey, principalVerifierKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: sessionStorageRowConfigSchema,
  body,
})
