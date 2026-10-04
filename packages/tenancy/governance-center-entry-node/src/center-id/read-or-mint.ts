// 启动时读或铸中心标识（入口契约 S-28 ④ 的三种读法与失败四支；入口节点 design「读或铸」与自构的交错 (a)(b)）。
// 一次 `storage.write`：锁住那一行 → 读 → 未铸即铸（那次提交就是首次启动的提交点）、已铸合形即用、
// 那一格不存在或值不合 S-27 即启动失败。「读不到」「那一格不存在」都绝不当作「未铸」（S-28 ⑦）。
import { randomBytes } from 'node:crypto'
import { type Storage, narrow } from '@omne-harness-lite/storage'
import {
  CENTER_SLOT,
  GOVERNANCE_CENTER_TABLE,
  type GovernanceCenterId,
  type GovernanceCenterTable,
  isGovernanceCenterId,
} from './table.ts'

/** S-28 ④ 的失败四支：读不到、写不进、那一格不存在、值不合 S-27。 */
export type GovernanceCenterIdentityFailure = 'unreadable' | 'unwritable' | 'missing' | 'malformed'

const EXPLANATIONS: Record<GovernanceCenterIdentityFailure, string> = {
  unreadable: 'the governance center identifier could not be read from storage (读不到)',
  unwritable: 'the newly minted governance center identifier could not be written (写不进)',
  missing:
    'the governance_center table exists but its identifier row is missing (那一格不存在); refusing to mint a new identity for existing data',
  malformed:
    'the stored governance center identifier is not 32 lowercase hexadecimal characters (值不合 S-27); refusing to repair or re-mint it',
}

/**
 * 启动失败的具名错误：`failure` 恰为 S-28 ④ 的四支之一，启动失败说明据它点名。
 * 说明里不带存储里的值（值不合形时也不写出那个值）；读不到、写不进时原始存储错误挂在 `cause` 上。
 */
export class GovernanceCenterIdentityError extends Error {
  override readonly name = 'GovernanceCenterIdentityError'
  readonly failure: GovernanceCenterIdentityFailure

  constructor(failure: GovernanceCenterIdentityFailure, options?: { readonly cause?: unknown }) {
    super(`governance-center-entry: ${EXPLANATIONS[failure]}`, options)
    this.failure = failure
  }
}

export interface CenterIdentity {
  readonly centerId: GovernanceCenterId
  /** 这一次启动铸出了它（首次启动）。 */
  readonly minted: boolean
}

/** 128 位随机的小写十六进制（S-27）。只在读到「未铸」时调用。 */
export function mintGovernanceCenterId(): string {
  return randomBytes(16).toString('hex')
}

export async function readOrMintCenterId(
  storage: Storage,
  mint: () => string = mintGovernanceCenterId,
): Promise<CenterIdentity> {
  // 在事务回调里改写：用一个对象承载，失败时据它判是哪一支
  const progress: { phase: 'read' | 'write' } = { phase: 'read' }
  try {
    return await storage.write(async tx => {
      await tx.lockRow(GOVERNANCE_CENTER_TABLE, { slot: CENTER_SLOT })
      const db = narrow<GovernanceCenterTable>(tx)
      const readCell = async () =>
        db
          .selectFrom(GOVERNANCE_CENTER_TABLE)
          .select('center_id')
          .where('slot', '=', CENTER_SLOT)
          .executeTakeFirst()
      const row = await readCell()
      if (row === undefined) throw new GovernanceCenterIdentityError('missing')
      if (row.center_id !== null) return { centerId: accepted(row.center_id), minted: false }

      const minted = mint()
      if (!isGovernanceCenterId(minted)) {
        throw new Error('governance-center-entry: minted identifier is not canonical')
      }
      progress.phase = 'write'
      const update = await db
        .updateTable(GOVERNANCE_CENTER_TABLE)
        .set({ center_id: minted })
        .where('slot', '=', CENTER_SLOT)
        .where('center_id', 'is', null)
        .executeTakeFirst()
      if (update.numUpdatedRows === 1n) return { centerId: minted, minted: true }
      // 交错 (a) 的第二道：锁没排上序时另一个写者先铸了，重读它的值
      progress.phase = 'read'
      const again = await readCell()
      if (again === undefined) throw new GovernanceCenterIdentityError('missing')
      if (again.center_id === null) throw new GovernanceCenterIdentityError('unwritable')
      return { centerId: accepted(again.center_id), minted: false }
    })
  } catch (error) {
    if (error instanceof GovernanceCenterIdentityError) throw error
    // 锁、读或（只读分支的）提交失败 ⇒ 读不到；铸的那次更新或它的提交失败 ⇒ 写不进。两支都不铸、不当作未铸
    throw new GovernanceCenterIdentityError(
      progress.phase === 'write' ? 'unwritable' : 'unreadable',
      {
        cause: error,
      },
    )
  }
}

function accepted(value: unknown): GovernanceCenterId {
  if (!isGovernanceCenterId(value)) throw new GovernanceCenterIdentityError('malformed')
  return value
}
