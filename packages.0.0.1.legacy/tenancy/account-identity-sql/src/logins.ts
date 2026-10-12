// `logins` 服务：S-15 签发、S-44 换取、S-16 撤销、S-17 校验、S-37 列表。
// 出示物只活在 `issue` 的局部变量与返回值、`exchange` 的局部变量里：不进任何存储语句、事件载荷、诊断与错误说明。
import type { CredentialMaterial } from '@omne-harness-lite/account-identity'
import {
  type AccountId,
  type LoginIdentifier,
  type LoginStateId,
  isOk,
  parseLoginIdentifier,
  parseLoginStateId,
} from '@omne-harness-lite/identity-values'
import { type Ack, type Outcome, fail, succeed } from '@omne-harness-lite/kernel-basis'
import { StorageDefect, StorageUnavailable, UniqueViolation } from '@omne-harness-lite/storage'
import { type PolicyDeps, storageUnavailable } from './deps.ts'
import { describeError } from './diagnostics.ts'
import {
  type LoginStatePresentation,
  parseLoginStatePresentation,
} from '@omne-harness-lite/account-identity'
import { deriveLoginStateId, generatePresentation } from './presentation.ts'
import { judgeLoginState, trustedNow, loginDeadlines, loginValidAt } from './records.ts'
import {
  FLAG_FALSE,
  LOGIN_STATE_PKEY,
  storedAccountId,
  storedFlag,
  storedRevision,
  storedLoginStateId,
  type IdentityWrite,
  type IdentityDataUnit,
} from './identity-data.ts'
import type {
  ChangeCredentialFailure,
  PreparedCredentialChange,
  PrepareCredentialResult,
  LoginParticipation,
  EffectiveLoginState,
  ExchangedIdentity,
  IssueFailure,
  IssuedLoginState,
  ListEffectiveFailure,
  LoginsService,
  RevokeFailure,
  VerifyLoginFailure,
} from '@omne-harness-lite/account-identity'

const INVALID_INPUT = { failure: 'invalid-input' } as const
const STORAGE_UNAVAILABLE = { failure: 'storage-unavailable' } as const
/** 标识不存在、凭据错误、账号未激活三种情形的**同一个**返回值（S-15、S-22、S-31），没有子字段。 */
const IDENTIFIER_OR_CREDENTIAL_REJECTED = { failure: 'identifier-or-credential-rejected' } as const

export class LoginsImpl implements Omit<LoginsService, 'participate'> {
  #prepared = new WeakMap<
    PreparedCredentialChange,
    {
      accountId: AccountId
      caller: LoginStateId
      revision: number
      material: CredentialMaterial
    }
  >()
  constructor(private readonly deps: PolicyDeps) {}

  /** Called only after all ordinary calls have finished. Old tickets cannot survive close. */
  clearPrepared(): void {
    this.#prepared = new WeakMap()
  }

  // ---- S-15 ----

  async issue(
    rawIdentifier: unknown,
    rawCredential: unknown,
  ): Promise<Outcome<IssuedLoginState, IssueFailure>> {
    const identifier = parseLoginIdentifier(rawIdentifier)
    if (!isOk(identifier)) return INVALID_INPUT
    const credentials = this.deps.resolveCredentials()
    if (credentials === undefined) {
      this.deps.diagnostics.warn('credentials-unavailable', { operation: 'issue' })
      return STORAGE_UNAVAILABLE
    }
    const presented = credentials.parse(rawCredential)
    if (!isOk(presented)) return INVALID_INPUT
    const { persistence } = this.deps
    try {
      // 事务外：读快照并对它比对凭据（R-8：scrypt 不进持锁段）
      const snapshot = await persistence.read(tx => tx.accountByIdentifier(identifier.ok))
      if (snapshot === undefined) return IDENTIFIER_OR_CREDENTIAL_REJECTED
      const compared = await credentials.verify(
        // 材料列由 S-13 产生、S-50 替换，写进去的就是 `credentials.derive` 的返回；本包只存不读它的内部
        snapshot.credential_material as CredentialMaterial,
        presented.ok,
      )
      if (compared === 'unavailable') return STORAGE_UNAVAILABLE
      if (compared === 'mismatch') return IDENTIFIER_OR_CREDENTIAL_REJECTED
      const snapshotAccount = storedAccountId(snapshot.account_id)
      // match 才开写事务：重读「是快照那一行且已激活」，与签发写入同提交
      return await persistence.write(tx =>
        this.#issueCommitted(
          tx,
          identifier.ok,
          snapshotAccount,
          storedRevision(snapshot.credential_revision),
        ),
      )
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'issue', error)
    }
  }

  async #issueCommitted(
    tx: IdentityWrite,
    identifier: LoginIdentifier,
    snapshotAccount: AccountId,
    snapshotRevision: number,
  ): Promise<Outcome<IssuedLoginState, IssueFailure>> {
    await tx.lockAccountByIdentifier(identifier)
    const current = await tx.accountByIdentifier(identifier)
    // 行已不在、换成了另一行、仍未激活：与「不存在／凭据错」同一个值
    if (
      current === undefined ||
      current.account_id !== snapshotAccount ||
      storedRevision(current.credential_revision) !== snapshotRevision ||
      !storedFlag(current.activated)
    ) {
      return IDENTIFIER_OR_CREDENTIAL_REJECTED
    }
    const issuedAt = await this.deps.clock.now()
    if (issuedAt === 'unavailable') return STORAGE_UNAVAILABLE
    // 出示物在一切判定通过之后才产生；随机源失败 ⇒ 不签发，不换任何别的来源
    let presentation: LoginStatePresentation
    try {
      presentation = generatePresentation(this.deps.random)
    } catch (error) {
      this.deps.diagnostics.error('random-source-unavailable', { cause: describeError(error) })
      return STORAGE_UNAVAILABLE
    }
    const loginStateId = deriveLoginStateId(presentation)
    loginDeadlines({
      login_state_id: loginStateId,
      account_id: snapshotAccount,
      issued_at: issuedAt,
      last_activity_at: issuedAt,
      credential_revision: snapshotRevision,
      revoked: FLAG_FALSE,
    })
    try {
      // 普通插入：撞主键 ⇒ 不签发，不 upsert、不合并、不读回既有行的任何东西
      await tx.insertLogin({
        login_state_id: loginStateId,
        account_id: snapshotAccount,
        issued_at: issuedAt,
        last_activity_at: issuedAt,
        credential_revision: snapshotRevision,
        revoked: FLAG_FALSE,
      })
    } catch (error) {
      if (error instanceof UniqueViolation && error.constraint === LOGIN_STATE_PKEY) {
        this.deps.diagnostics.error('login-state-id-collision', {})
        return STORAGE_UNAVAILABLE
      }
      throw error
    }
    // 以事务函数的返回值交出：提交成立之后才离开本插件；提交失败则随局部变量作废
    return succeed({ presentation, loginStateId })
  }

  // Ordinary methods return only after their own atomic boundary has ended.
  async #ordinary<T>(
    operation: string,
    fn: (scope: LoginParticipation) => Promise<T>,
  ): Promise<T | { readonly failure: 'storage-unavailable' }> {
    try {
      return await this.deps.persistence.atomic(unit => fn(this.participate(unit)))
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, operation, error)
    }
  }

  exchange(presentation: unknown): Promise<Outcome<ExchangedIdentity, VerifyLoginFailure>> {
    return this.#ordinary('exchange', scope => scope.exchange(presentation))
  }
  verify(id: LoginStateId): Promise<Outcome<AccountId, VerifyLoginFailure>> {
    return this.#ordinary('verify', scope => scope.verify(id))
  }
  revoke(target: unknown, initiator: LoginStateId): Promise<Ack<RevokeFailure>> {
    return this.#ordinary('revoke', scope => scope.revoke(target, initiator))
  }
  listEffective(
    caller: LoginStateId,
  ): Promise<Outcome<readonly EffectiveLoginState[], ListEffectiveFailure>> {
    return this.#ordinary('listEffective', scope => scope.listEffective(caller))
  }

  participate(unit: IdentityDataUnit): LoginParticipation {
    const invoke = <T>(fn: () => Promise<T>): Promise<T> => {
      return unit.run(fn)
    }
    return {
      exchange: presentation =>
        invoke(async () => {
          const parsed = parseLoginStatePresentation(presentation)
          if (!isOk(parsed)) return INVALID_INPUT
          const loginStateId = deriveLoginStateId(parsed.ok)
          const judged = await unit.query(tx => judgeLoginState(tx, loginStateId, this.deps.clock))
          return 'failure' in judged ? judged : succeed({ loginStateId, accountId: judged.ok })
        }),
      verify: id =>
        invoke(async () => {
          const parsed = parseLoginStateId(id)
          return isOk(parsed)
            ? unit.query(tx => judgeLoginState(tx, parsed.ok, this.deps.clock))
            : INVALID_INPUT
        }),
      revoke: (target, initiator) =>
        invoke(async () => {
          const targetId = parseLoginStateId(target)
          const initiatorId = parseLoginStateId(initiator)
          if (!isOk(targetId) || !isOk(initiatorId)) return INVALID_INPUT
          const outcome = await unit.mutate(async tx => {
            const judged = await judgeLoginState(tx, initiatorId.ok, this.deps.clock)
            if ('failure' in judged) return fail('not-authorized')
            const row = await tx.loginById(targetId.ok)
            if (row === undefined || storedAccountId(row.account_id) !== judged.ok)
              return fail('login-state-not-found')
            if (storedFlag(row.revoked)) return { revoked: undefined }
            await tx.revokeLogin(targetId.ok)
            return { revoked: { loginStateId: targetId.ok, accountId: judged.ok } }
          })
          if ('failure' in outcome) return outcome
          const payload = outcome.revoked
          if (payload !== undefined)
            unit.afterCommit(() => this.deps.notifier.loginRevoked(payload))
          return 'ok'
        }),
      listEffective: caller =>
        invoke(async () => {
          const parsed = parseLoginStateId(caller)
          if (!isOk(parsed)) return INVALID_INPUT
          return unit.query(async tx => {
            // One lazily obtained instant for both caller validation and filtering.
            let now: ReturnType<typeof trustedNow> | undefined
            const clock = { now: () => (now ??= trustedNow(this.deps.clock)) }
            const judged = await judgeLoginState(tx, parsed.ok, clock)
            if ('failure' in judged) return judged
            const account = await tx.accountById(judged.ok)
            if (account === undefined) throw new StorageDefect('validated account disappeared')
            const rows = await tx.loginsByAccount(judged.ok)
            const instant = await clock.now()
            const values = rows
              .filter(row =>
                loginValidAt(row, storedRevision(account.credential_revision), instant),
              )
              .map(row => ({
                loginStateId: storedLoginStateId(row.login_state_id),
                ...loginDeadlines(row),
              }))
            if (!values.some(row => row.loginStateId === parsed.ok))
              throw new StorageDefect('effective login list omitted its validated caller')
            return succeed(values)
          })
        }),
      finalizeActivity: caller =>
        invoke(async () => {
          const parsed = parseLoginStateId(caller)
          if (!isOk(parsed)) return INVALID_INPUT
          const now = await trustedNow(this.deps.clock)
          await unit.mutate(async tx => {
            const judged = await judgeLoginState(tx, parsed.ok, { now: async () => now })
            if ('failure' in judged) return
            await tx.recordActivity(parsed.ok, now)
          })
          return 'ok'
        }),
      commitCredentialChange: ticket =>
        invoke(async () => {
          const prepared = this.#prepared.get(ticket)
          if (prepared === undefined)
            throw new StorageDefect('invalid or consumed credential preparation')
          this.#prepared.delete(ticket)
          return unit.mutate(async tx => {
            const account = await tx.accountById(prepared.accountId)
            if (
              account === undefined ||
              storedRevision(account.credential_revision) !== prepared.revision
            )
              return fail('current-credential-rejected')
            const judged = await judgeLoginState(tx, prepared.caller, this.deps.clock)
            if ('failure' in judged) return judged
            if (judged.ok !== prepared.accountId)
              throw new StorageDefect('credential preparation account changed')
            if (prepared.revision === Number.MAX_SAFE_INTEGER)
              throw new StorageUnavailable('credential revision overflow')
            await tx.replaceCredential(prepared.accountId, prepared.material, prepared.revision + 1)
            return 'ok'
          })
        }),
    }
  }

  async prepareCredentialChange(
    caller: LoginStateId,
    current: unknown,
    next: unknown,
  ): Promise<PrepareCredentialResult> {
    const parsed = parseLoginStateId(caller)
    if (!isOk(parsed)) return INVALID_INPUT
    const credentials = this.deps.resolveCredentials()
    if (credentials === undefined) return STORAGE_UNAVAILABLE
    const oldCredential = credentials.parse(current)
    const newCredential = credentials.parse(next)
    if (!isOk(oldCredential) || !isOk(newCredential)) return INVALID_INPUT
    try {
      const snapshot = await this.deps.persistence.atomic(unit =>
        unit.query(async tx => {
          const judged = await judgeLoginState(tx, parsed.ok, this.deps.clock)
          if ('failure' in judged) return judged
          const row = await tx.accountById(judged.ok)
          if (row === undefined) throw new StorageDefect('validated account disappeared')
          return succeed(row)
        }),
      )
      if ('failure' in snapshot) return snapshot
      const compared = await credentials.verify(
        snapshot.ok.credential_material as CredentialMaterial,
        oldCredential.ok,
      )
      if (compared === 'unavailable') return STORAGE_UNAVAILABLE
      if (compared === 'mismatch') return fail('current-credential-rejected')
      const policy = this.deps.credentialPolicy
      if (policy === undefined || credentials.checkPolicy(policy, newCredential.ok) !== 'ok')
        return fail('credential-rejected')
      const material = await credentials.derive(newCredential.ok)
      if (material === 'unavailable') return STORAGE_UNAVAILABLE
      const ticket = Object.freeze({}) as PreparedCredentialChange
      this.#prepared.set(ticket, {
        accountId: storedAccountId(snapshot.ok.account_id),
        caller: parsed.ok,
        revision: storedRevision(snapshot.ok.credential_revision),
        material,
      })
      return succeed(ticket)
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'prepareCredentialChange', error)
    }
  }

  async changeCredential(
    caller: LoginStateId,
    current: unknown,
    next: unknown,
  ): Promise<Ack<ChangeCredentialFailure>> {
    const prepared = await this.prepareCredentialChange(caller, current, next)
    if ('failure' in prepared) return prepared
    try {
      return await this.#ordinary('changeCredential', scope =>
        scope.commitCredentialChange(prepared.ok),
      )
    } finally {
      this.#prepared.delete(prepared.ok)
    }
  }
}
