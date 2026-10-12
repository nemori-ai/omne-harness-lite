import {
  narrow,
  StorageDefect,
  type AtomicStorage,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { copyJsonValue, readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { ToolOriginalIssueIdentity } from '@omne-harness-lite/tool-execution-runtime'
import { sameJson } from './json-values.ts'

/** Trusted read-only construction. The caller owns the unit and qualification. */
export function createToolOriginalIssueVerifier(storage: AtomicStorage) {
  return Object.freeze({
    async verifyIn(unit: StorageUnit, identity: ToolOriginalIssueIdentity): Promise<boolean> {
      unit.assertStorage(storage)
      const copied = copyJsonValue(identity)
      if ('failed' in copied) return false
      const fixed = copied.ok as unknown as ToolOriginalIssueIdentity
      const row = await unit.query(tx =>
        narrow<{
          tool_original_issue: { tenant: string; session: string; call: string; identity: string }
        }>(tx)
          .selectFrom('tool_original_issue')
          .select('identity')
          .where('tenant', '=', writeJsonLossless(fixed.ref.tenant))
          .where('session', '=', fixed.ref.session)
          .where('call', '=', fixed.ref.callId)
          .executeTakeFirst(),
      )
      if (!row) return false
      const parsed = readJsonStrict(row.identity)
      if ('failed' in parsed) throw new StorageDefect('invalid original Tool identity')
      return sameJson(parsed.ok, copied.ok)
    },
  })
}
