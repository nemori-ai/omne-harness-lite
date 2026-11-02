// `identity.standing`: the membership row of one tenant text, or none. The handler reports what the
// row holds; the provider decides `member`, `not-member` or `unavailable` (DP3-C12).
import { HANDLERS, isRecord, isText, type StandingInput, type StandingOutput } from './schema.ts'
import { handler, oneRow, text } from './support.ts'

export default handler<StandingInput, StandingOutput>(
  HANDLERS.standing,
  raw =>
    isRecord(raw) && isText(raw['tenantText']) && raw['tenantText'] !== ''
      ? { tenantText: raw['tenantText'] }
      : undefined,
  (input, port) => {
    const row = oneRow(
      port,
      `SELECT state, role_model, role_model_revision, role, revision
         FROM id_membership WHERE tenant_text = ? LIMIT 1`,
      [input.tenantText],
    )
    return {
      membership:
        row === undefined
          ? null
          : {
              state: text(row['state']),
              roleModel: text(row['role_model']),
              roleModelRevision: text(row['role_model_revision']),
              role: text(row['role']),
              revision: text(row['revision']),
            },
    }
  },
)
