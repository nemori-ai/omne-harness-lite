// `accounts` 服务：S-13 产生、S-14 激活、S-18 读、S-38 清除。每个写操作恰一次 `storage` 提交，提交之后才发事件。
// 凭据的比对、政策与派生都在写事务之前、对快照做；提交内锁定读确认「同一行、同一类」（R-8、契约 S-30 第 4 行）。
import type {
  CredentialMaterial,
  CredentialsService,
  PresentedCredential,
} from '@omne-harness-lite/account-identity'
import {
  type AccountId,
  type LoginIdentifier,
  generateOpaqueIdentifier,
  isOk,
  parseAccountId,
  parseLoginIdentifier,
  verifyHandoffWarrant,
} from '@omne-harness-lite/identity-values'
import { type Ack, type Outcome, fail, succeed } from '@omne-harness-lite/kernel-basis'
import { addDuration } from '@omne-harness-lite/offer-expiry'
import { ReferenceViolation, UniqueViolation } from '@omne-harness-lite/storage'
import { type PolicyDeps, storageUnavailable } from './deps.ts'
import { defect, describeError } from './diagnostics.ts'
import { classifyAccount, sameOccupancy, settleExpiry } from './records.ts'
import {
  ACCOUNT_LOGIN_IDENTIFIER_UNIQUE,
  ACCOUNT_PKEY,
  FLAG_FALSE,
  storedFlag,
  storedAccountId,
  storedLoginIdentifier,
  type IdentityWrite,
  type IdentityDataUnit,
} from './identity-data.ts'
import type {
  AccountReading,
  AccountsService,
  ActivateFailure,
  ProduceResult,
  PurgeFailure,
  ReadFailure,
} from '@omne-harness-lite/account-identity'

const INVALID_INPUT = { failure: 'invalid-input' } as const
const STORAGE_UNAVAILABLE = { failure: 'storage-unavailable' } as const
const IDENTIFIER_TAKEN = { failure: 'identifier-taken' } as const
const POLICY_UNAVAILABLE_REASON = 'credential-policy-unavailable'

/** 快照之后同一标识上又有别的提交时，从快照重来的次数上限；再变 ⇒ `storage-unavailable`（判不出来）。 */
const PRODUCE_ATTEMPTS = 2

export class AccountsImpl implements Omit<AccountsService, 'participate'> {
  constructor(private readonly deps: PolicyDeps) {}

  // ---- S-13 ----

  async produce(rawIdentifier: unknown, rawCredential: unknown): Promise<ProduceResult> {
    const identifier = parseLoginIdentifier(rawIdentifier)
    if (!isOk(identifier)) return INVALID_INPUT
    const credentials = this.deps.resolveCredentials()
    if (credentials === undefined) {
      // 凭据的词法判据归它的 owner；owner 不在就判不出来，不是 invalid-input
      this.deps.diagnostics.warn('credentials-unavailable', { operation: 'produce' })
      return STORAGE_UNAVAILABLE
    }
    const presented = credentials.parse(rawCredential)
    if (!isOk(presented)) return INVALID_INPUT
    try {
      for (let attempt = 0; attempt < PRODUCE_ATTEMPTS; attempt += 1) {
        const outcome = await this.#produceOnce(identifier.ok, credentials, presented.ok)
        if (outcome !== 'retry') return outcome
      }
      this.deps.diagnostics.warn('produce-contended', { attempts: PRODUCE_ATTEMPTS })
      return STORAGE_UNAVAILABLE
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'produce', error)
    }
  }

  async #produceOnce(
    identifier: LoginIdentifier,
    credentials: CredentialsService,
    presented: PresentedCredential,
  ): Promise<ProduceResult | 'retry'> {
    const { persistence, clock } = this.deps
    // ② 快照：分四类；凭据计算只对快照做，不进写事务（R-8）
    const snapshot = classifyAccount(
      await persistence.read(tx => tx.accountByIdentifier(identifier)),
      clock,
    )
    if (snapshot === 'clock-unavailable') return STORAGE_UNAVAILABLE
    let reclaim = false
    if (snapshot.kind === 'live') {
      const compared = await credentials.verify(snapshot.material, presented)
      if (compared === 'unavailable') return STORAGE_UNAVAILABLE
      reclaim = compared === 'match'
    }
    let material: CredentialMaterial | undefined
    if (!reclaim) {
      // 认回那一路不判政策；其余路径政策先于占用判定
      const policy = this.#checkPolicy(credentials, presented)
      if (policy !== 'ok') return policy
      if (snapshot.kind === 'none') {
        const derived = await credentials.derive(presented)
        if (derived === 'unavailable') return STORAGE_UNAVAILABLE
        material = derived
      }
    }
    // ③ 一次写事务：锁定读，与快照是同一行、同一类才按类收场；否则不写、重来
    return persistence.write(async tx => {
      await tx.lockAccountByIdentifier(identifier)
      const current = classifyAccount(await tx.accountByIdentifier(identifier), clock)
      if (current === 'clock-unavailable') return STORAGE_UNAVAILABLE
      if (!sameOccupancy(snapshot, current)) return 'retry'
      switch (current.kind) {
        case 'none':
          return this.#insertAccount(tx, identifier, material)
        case 'activated':
          return IDENTIFIER_TAKEN
        case 'expired':
          if (!current.landed && current.observedAt !== undefined)
            await tx.landAccountExpiry(current.accountId, current.observedAt)
          return {
            failure: 'identifier-held-by-expired-record',
            expiredRecord: current.accountId,
          } as const
        case 'live':
          return reclaim ? succeed(current.accountId) : IDENTIFIER_TAKEN
      }
    })
  }

  async #insertAccount(
    tx: IdentityWrite,
    identifier: LoginIdentifier,
    material: CredentialMaterial | undefined,
  ): Promise<ProduceResult | 'retry'> {
    // 快照为「无」时一定已经派生过材料；到这里还没有是本包的缺陷
    if (material === undefined) throw defect('produce: no derived material on the insert path')
    const producedAt = this.deps.clock.now()
    if (producedAt === 'unavailable') return STORAGE_UNAVAILABLE
    const accountId = newAccountId()
    try {
      await tx.insertAccount({
        account_id: accountId,
        login_identifier: identifier,
        credential_material: material,
        credential_revision: 0,
        activated: FLAG_FALSE,
        produced_at: producedAt,
        retention_deadline: addDuration(producedAt, this.deps.unactivatedRetention),
        expired_at: null,
      })
    } catch (error) {
      if (error instanceof UniqueViolation) {
        // 同一标识在快照之后被另一次提交占用：本事务不写，从快照重来
        if (error.constraint === ACCOUNT_LOGIN_IDENTIFIER_UNIQUE) return 'retry'
        if (error.constraint === ACCOUNT_PKEY) {
          this.deps.diagnostics.error('account-id-collision', {})
          return STORAGE_UNAVAILABLE
        }
      }
      throw error
    }
    return succeed(accountId)
  }

  #checkPolicy(
    credentials: CredentialsService,
    presented: PresentedCredential,
  ): 'ok' | { readonly failure: 'credential-rejected'; readonly reason: string } {
    const policy = this.deps.credentialPolicy
    // 取不到（缺省或形状不合）⇒ credential-rejected，不退化为不校验（S-27）
    if (policy === undefined) {
      this.deps.diagnostics.warn('credential-policy-unavailable', { cause: 'absent' })
      return { failure: 'credential-rejected', reason: POLICY_UNAVAILABLE_REASON }
    }
    const checked = credentials.checkPolicy(policy, presented)
    if (checked === 'ok') return 'ok'
    if (checked === 'unavailable') {
      this.deps.diagnostics.warn('credential-policy-unavailable', { cause: 'malformed' })
      return { failure: 'credential-rejected', reason: POLICY_UNAVAILABLE_REASON }
    }
    return { failure: 'credential-rejected', reason: checked.rejected }
  }

  // ---- S-14 ----

  async activate(rawAccountId: unknown, warrant: unknown): Promise<Ack<ActivateFailure>> {
    const parsed = parseAccountId(rawAccountId)
    if (!isOk(parsed)) return INVALID_INPUT
    const accountId = parsed.ok
    const { persistence, clock, activationKey } = this.deps
    try {
      const outcome = await persistence.write(
        async (
          tx,
        ): Promise<{ readonly failure: ActivateFailure } | { readonly changed: boolean }> => {
          await tx.lockAccountById(accountId)
          const row = await tx.accountById(accountId)
          // 次序：表示层 → 存在性 → 依据核验 → 状态判定；依据先于状态，坏掉的依据链不被「反正过期了」盖掉
          if (row === undefined) return fail('account-not-found')
          if (verifyHandoffWarrant(activationKey, 'activation', accountId, warrant) !== 'ok')
            return fail('warrant-invalid')
          if (storedFlag(row.activated)) return { changed: false }
          const expiry = await settleExpiry(tx, row, clock)
          if (expiry === 'clock-unavailable') return fail('storage-unavailable')
          if (expiry === 'expired') return fail('account-record-expired')
          await tx.activateAccount(accountId)
          return { changed: true }
        },
      )
      if ('failure' in outcome) return outcome
      if (outcome.changed) this.deps.notifier.accountActivated({ accountId })
      return 'ok'
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'activate', error)
    }
  }

  // ---- S-18 ----

  async read(rawAccountId: unknown): Promise<Outcome<AccountReading, ReadFailure>> {
    try {
      return await this.deps.persistence.atomic(unit => this.participate(unit).read(rawAccountId))
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'read', error)
    }
  }

  participate(
    unit: IdentityDataUnit,
  ): import('@omne-harness-lite/account-identity').AccountParticipation {
    const invoke = <T>(fn: () => Promise<T>): Promise<T> => {
      return unit.run(fn)
    }
    return {
      read: raw =>
        invoke(async () => {
          const parsed = parseAccountId(raw)
          if (!isOk(parsed)) return INVALID_INPUT
          return unit.mutate(async tx => {
            const row = await tx.accountById(parsed.ok)
            if (row === undefined) return fail('account-not-found')
            if (storedFlag(row.activated)) return succeed(ACTIVATED_READING)
            const expiry = await settleExpiry(tx, row, this.deps.clock)
            if (expiry === 'clock-unavailable') return STORAGE_UNAVAILABLE
            return succeed(expiry === 'expired' ? EXPIRED_READING : UNEXPIRED_READING)
          })
        }),
      resolveActivatedIdentifier: raw =>
        invoke(async () => {
          const parsed = parseLoginIdentifier(raw)
          if (!isOk(parsed)) return INVALID_INPUT
          return unit.query(async tx => {
            const row = await tx.accountByIdentifier(parsed.ok)
            return row !== undefined && storedFlag(row.activated)
              ? succeed(storedAccountId(row.account_id))
              : fail('account-not-found')
          })
        }),
    }
  }

  // ---- S-38 ----

  async purge(rawAccountId: unknown, warrant: unknown): Promise<Ack<PurgeFailure>> {
    const parsed = parseAccountId(rawAccountId)
    if (!isOk(parsed)) return INVALID_INPUT
    const accountId = parsed.ok
    const { persistence, clock, purgeKey } = this.deps
    try {
      const outcome = await persistence.write(
        async (
          tx,
        ): Promise<
          { readonly failure: PurgeFailure } | { readonly deleted: LoginIdentifier | undefined }
        > => {
          await tx.lockAccountById(accountId)
          // 次序：表示层 → 存在性（分流，不产生失败值）→ 依据核验 → 状态判定；幂等的 ok 也要等依据通过
          const row = await tx.accountById(accountId)
          if (verifyHandoffWarrant(purgeKey, 'purge', accountId, warrant) !== 'ok')
            return fail('purge-warrant-invalid')
          if (row === undefined) return { deleted: undefined }
          if (storedFlag(row.activated)) return fail('not-expired')
          const expiry = await settleExpiry(tx, row, clock)
          if (expiry === 'clock-unavailable') return fail('storage-unavailable')
          if (expiry === 'live') return fail('not-expired')
          try {
            // 删除一行即释放标识：标识就是这一行的一列，唯一约束建在它上面
            await tx.deleteAccount(accountId)
          } catch (error) {
            if (error instanceof ReferenceViolation && error.kind === 'delete-restricted') {
              // 还有别的表（本版：个人组织行）引用它；本包不知道也不该知道是谁。清除链按抖动型重扫
              this.deps.diagnostics.warn('purge-delete-restricted', {
                cause: describeError(error),
              })
              return fail('storage-unavailable')
            }
            throw error
          }
          return { deleted: storedLoginIdentifier(row.login_identifier) }
        },
      )
      if ('failure' in outcome) return outcome
      if (outcome.deleted !== undefined)
        this.deps.notifier.accountExpired({ accountId, loginIdentifier: outcome.deleted })
      return 'ok'
    } catch (error) {
      return storageUnavailable(this.deps.diagnostics, 'purge', error)
    }
  }
}

const ACTIVATED_READING: AccountReading = { activated: true, retentionExpired: false }
const EXPIRED_READING: AccountReading = { activated: false, retentionExpired: true }
const UNEXPIRED_READING: AccountReading = { activated: false, retentionExpired: false }

function newAccountId(): AccountId {
  const parsed = parseAccountId(generateOpaqueIdentifier())
  if (!isOk(parsed)) throw defect('generated AccountId failed its own lexical check')
  return parsed.ok
}
