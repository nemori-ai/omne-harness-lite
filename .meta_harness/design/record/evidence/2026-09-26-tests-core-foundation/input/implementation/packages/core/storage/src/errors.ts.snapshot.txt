/**
 * 存储失败的四型。以异常到达调用方；调用方只 catch 前三种，`StorageDefect` 与其他异常上抛（那是缺陷）。
 * 设计：.meta_harness/design/realization/packages/core/storage/design.md（协议 P-1～P-12）。
 */

/** 瞬时失败：连接、忙超时、I/O、撤除期间被关。调用方折成契约的「不可用」字面（`mapStorageError`）。 */
export class StorageUnavailable extends Error {
  override readonly name = 'StorageUnavailable'
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options)
  }
}

/** 唯一约束冲突；`constraint` 是迁移里给该约束起的名字，两种方言对同一约束给同一个字符串（P-11）。 */
export class UniqueViolation extends Error {
  override readonly name = 'UniqueViolation'
  constructor(
    readonly constraint: string,
    options?: { readonly cause?: unknown },
  ) {
    super(`unique constraint violated: ${constraint}`, options)
  }
}

export type ReferenceViolationKind = 'delete-restricted' | 'missing-target'

/** 引用约束两向（P-10）：`kind` 由提供者按触发语句的种类分类，方言错误码不区分两向。 */
export class ReferenceViolation extends Error {
  override readonly name = 'ReferenceViolation'
  constructor(
    readonly kind: ReferenceViolationKind,
    options?: { readonly cause?: unknown },
  ) {
    super(`reference constraint violated: ${kind}`, options)
  }
}

/**
 * 缺陷：语法错误、未知列、NOT NULL／CHECK 违反、只读事务里写、约束名映射不到……
 * 不是「不可用」——把它折成不可用会让清除链把 schema 缺陷当抖动无限重扫。调用方不映射、直接上抛。
 */
export class StorageDefect extends Error {
  override readonly name = 'StorageDefect'
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options)
  }
}

export type StorageFailure =
  StorageUnavailable | UniqueViolation | ReferenceViolation | StorageDefect
