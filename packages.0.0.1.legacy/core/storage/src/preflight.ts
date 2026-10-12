// 迁移前的只读核对：装配把几条核对交给存储提供者，提供者在跑迁移与任何写之前、
// 一次只读事务里逐条执行；任一不过 ⇒ 不写任何东西、具名启动失败。
// 设计：packages/infra/storage-sql/SPEC.md，
// 判据各归其主：数据格式归 tenancy-host，时钟回拨归 infra/clock，中心标识表归 tenancy/governance-center-entry。
import type { ReadTx } from './protocol.ts'

export interface PreflightInput {
  /** 与核对同一个只读事务；在里面写 ⇒ `StorageDefect`。 */
  readonly tx: ReadTx
  /** 提供者在同一读事务里先读好的已存在表名集合（含迁移登记表本身）。核对者不必自己判「表在不在」。 */
  readonly tables: ReadonlySet<string>
  /** 已登记的迁移名，按执行次序；空库为空数组。读不到不会到这里——那以 `StorageUnavailable` 到达。 */
  readonly appliedMigrations: readonly string[]
}

export type PreflightResult =
  | { readonly ok: true }
  /** `check` 是核对的稳定名字，`detail` 是给运维者看的「差的是哪一样」；提供者原样放进启动失败，不解释。 */
  | { readonly ok: false; readonly check: string; readonly detail: string }

export type PreflightCheck = (input: PreflightInput) => Promise<PreflightResult>
