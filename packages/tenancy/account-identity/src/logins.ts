// `logins` 服务：S-15 签发、S-44 换取、S-16 撤销、S-17 校验、S-37 列表。
// 出示物只活在 `issue` 的局部变量与返回值、`exchange` 的局部变量里：不进任何存储语句、事件载荷、诊断与错误说明。
import type { CredentialMaterial } from '@omne-harness-lite/credential-verification'
import {
  type AccountId,
  type LoginIdentifier,
  type LoginStateId,
  isOk,
  parseLoginIdentifier,
  parseLoginStateId,
} from '@omne-harness-lite/identity-values'
import { type Ack, type Outcome, fail, succeed } from '@omne-harness-lite/kernel-basis'
import { UniqueViolation, type WriteTx, narrow } from '@omne-harness-lite/storage'
import { type ServiceDeps, storageUnavailable } from './deps.ts'
import { describeError } from './diagnostics.ts'
import {
  type LoginStatePresentation,
  deriveLoginStateId,
  generatePresentation,
  parseLoginStatePresentation,
} from './presentation.ts'
import { judgeLoginState, selectAccountByIdentifier } from './records.ts'
import {
  ACCOUNT_TABLE,
  type AccountIdentityDb,
  FLAG_FALSE,
  FLAG_TRUE,
  LOGIN_STATE_PKEY,
  LOGIN_STATE_TABLE,
  storedAccountId,
  storedFlag,
  storedInstant,
  storedLoginStateId,
} from './schema.ts'
import type {
  EffectiveLoginState,
  ExchangedIdentity,
  IssueFailure,
  IssuedLoginState,
  ListEffectiveFailure,
  LoginsService,
  RevokeFailure,
  VerifyLoginFailure,
} from './surface.ts'

const INVALID_INPUT = { failure: 'invalid-input' } as const
const STORAGE_UNAVAILABLE = { failure: 'storage-unavailable' } as const
/** 标识不存在、凭据错误、账号未激活三种情形的**同一个**返回值（S-15、S-22、S-31），没有子字段。 */
const IDENTIFIER_OR_CREDENTIAL_REJECTED = { failure: 'identifier-or-credential-rejected' } as const

export class LoginsImpl implements LoginsService {
  constructor(private readonly deps: ServiceDeps) {}

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
    const { storage } = this.deps
    try {
      // 事务外：读快照并对它比对凭据（R-8：scrypt 不进持锁段）
      const snapshot = await storage.read(tx => selectAccountByIdentifier(tx, identifier.ok))
      if (snapshot === undefined) return IDENTIFIER_OR_CREDENTIAL_REJECTED
      const compared = await credentials.verify(
        // 材料列只由 S-13 写入一次，写进去的就是 `credentials.derive` 的返回；本包只存不读它的内部
        snapshot.credential_material as CredentialMaterial,
        presented.ok,
      )
      if (compared === 'unavailable') return STORAGE_UNAVAILABLE
      if (compared === 'mismatch') return IDENTIFIER_OR_CREDENTIAL_REJECTED
      const snapshotAccount = storedAccountId(snapshot.account_id)
      // match 才开写事务：重读「是快照那一行且已激活」，与签发写入同提交
      return await storage.write(tx => this.#issueCommitted(tx, identifier.ok, snapshotAccount))
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'issue', error)
    }
  }

  async #issueCommitted(
    tx: WriteTx,
    identifier: LoginIdentifier,
    snapshotAccount: AccountId,
  ): Promise<Outcome<IssuedLoginState, IssueFailure>> {
    await tx.lockRow(ACCOUNT_TABLE, { login_identifier: identifier })
    const current = await selectAccountByIdentifier(tx, identifier)
    // 行已不在、换成了另一行、仍未激活：与「不存在／凭据错」同一个值
    if (
      current === undefined ||
      current.account_id !== snapshotAccount ||
      !storedFlag(current.activated)
    ) {
      return IDENTIFIER_OR_CREDENTIAL_REJECTED
    }
    const issuedAt = this.deps.clock.now()
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
    try {
      // 普通插入：撞主键 ⇒ 不签发，不 upsert、不合并、不读回既有行的任何东西
      await narrow<AccountIdentityDb>(tx)
        .insertInto(LOGIN_STATE_TABLE)
        .values({
          login_state_id: loginStateId,
          account_id: snapshotAccount,
          issued_at: issuedAt,
          revoked: FLAG_FALSE,
        })
        .execute()
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

  // ---- S-44 ----

  async exchange(presentation: unknown): Promise<Outcome<ExchangedIdentity, VerifyLoginFailure>> {
    const parsed = parseLoginStatePresentation(presentation)
    if (!isOk(parsed)) return INVALID_INPUT
    // 先派生，再走 S-17 的判定——同一个函数，不设任何捷径（不因「长得像 LoginStateId」就不查而拒）
    const loginStateId = deriveLoginStateId(parsed.ok)
    try {
      const judged = await this.deps.storage.read(tx => judgeLoginState(tx, loginStateId))
      if ('failure' in judged) return judged
      return succeed({ loginStateId, accountId: judged.ok })
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'exchange', error)
    }
  }

  // ---- S-16 ----

  async revoke(target: unknown, initiator: LoginStateId): Promise<Ack<RevokeFailure>> {
    // 两个参数的表示层都只用 IV S-31，不收紧到 64 个十六进制字符（S-45）；品牌参数在运行期同样先过这一层
    const targetId = parseLoginStateId(target)
    const initiatorId = parseLoginStateId(initiator)
    if (!isOk(targetId) || !isOk(initiatorId)) return INVALID_INPUT
    try {
      const outcome = await this.deps.storage.write(
        async (
          tx,
        ): Promise<
          | { readonly failure: RevokeFailure }
          | { readonly revoked: { loginStateId: LoginStateId; accountId: AccountId } | undefined }
        > => {
          // 授权第一半：发起方此刻有效，排在目标存在性之前
          const initiatorJudged = await judgeLoginState(tx, initiatorId.ok)
          if ('failure' in initiatorJudged) return fail('not-authorized')
          await tx.lockRow(LOGIN_STATE_TABLE, { login_state_id: targetId.ok })
          const row = await narrow<AccountIdentityDb>(tx)
            .selectFrom(LOGIN_STATE_TABLE)
            .select(['account_id', 'revoked'])
            .where('login_state_id', '=', targetId.ok)
            .executeTakeFirst()
          if (row === undefined) return fail('login-state-not-found')
          // 授权第二半：目标属于发起方的账号，否则与「查不到」逐字相同
          const owner = storedAccountId(row.account_id)
          if (owner !== initiatorJudged.ok) return fail('login-state-not-found')
          if (storedFlag(row.revoked)) return { revoked: undefined }
          // 撤销只改 revoked 一列；没有任何语句改 login_state_id
          await narrow<AccountIdentityDb>(tx)
            .updateTable(LOGIN_STATE_TABLE)
            .set({ revoked: FLAG_TRUE })
            .where('login_state_id', '=', targetId.ok)
            .execute()
          return { revoked: { loginStateId: targetId.ok, accountId: owner } }
        },
      )
      if ('failure' in outcome) return outcome
      if (outcome.revoked !== undefined) this.deps.notifier.loginRevoked(outcome.revoked)
      return 'ok'
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'revoke', error)
    }
  }

  // ---- S-17 ----

  async verify(loginStateId: LoginStateId): Promise<Outcome<AccountId, VerifyLoginFailure>> {
    const parsed = parseLoginStateId(loginStateId)
    if (!isOk(parsed)) return INVALID_INPUT
    try {
      // 每次现读，读写同源；无缓存
      return await this.deps.storage.read(tx => judgeLoginState(tx, parsed.ok))
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'verify', error)
    }
  }

  // ---- S-37 ----

  async listEffective(
    caller: LoginStateId,
  ): Promise<Outcome<readonly EffectiveLoginState[], ListEffectiveFailure>> {
    const parsed = parseLoginStateId(caller)
    if (!isOk(parsed)) return INVALID_INPUT
    try {
      // 校验与列表落在同一次读事务里（同一个快照）
      const listed = await this.deps.storage.read(async tx => {
        const judged = await judgeLoginState(tx, parsed.ok)
        if ('failure' in judged) return judged
        const rows = await narrow<AccountIdentityDb>(tx)
          .selectFrom(LOGIN_STATE_TABLE)
          .select(['login_state_id', 'issued_at'])
          .where('account_id', '=', judged.ok)
          .where('revoked', '=', FLAG_FALSE)
          .orderBy('issued_at')
          .orderBy('login_state_id')
          .execute()
        return succeed(
          rows.map(row => ({
            loginStateId: storedLoginStateId(row.login_state_id),
            issuedAt: storedInstant(row.issued_at),
          })),
        )
      })
      if ('failure' in listed) return listed
      // 自检：成功路径的结果至少含调用方自己那一条；空集在这里一定是错的，不当真交出去
      if (!listed.ok.some(state => state.loginStateId === parsed.ok)) {
        this.deps.diagnostics.error('list-effective-self-check-failed', {
          listed: listed.ok.length,
        })
        return STORAGE_UNAVAILABLE
      }
      return listed
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'listEffective', error)
    }
  }
}
