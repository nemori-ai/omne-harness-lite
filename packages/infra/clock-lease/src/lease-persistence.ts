// 私有事实和操作形状。比较条件及事务保持见 SPEC.md。
export interface LeaseRecord {
  readonly lease_until: number
  readonly written_at: number
}

export interface LeasePersistence {
  initialize(
    at: number,
    leaseUntil: number,
  ): Promise<{
    readonly row: LeaseRecord
    readonly fresh: boolean
  }>
  advance(at: number, leaseUntil: number): Promise<boolean>
  retract(expectedLeaseUntil: number, at: number): Promise<void>
}
