// `identity.login-by-proof`: the login row of one proof digest, and whether a revocation of it is
// recorded. The proof itself never reaches the Worker (DP3-C10). Deadlines travel as encoded
// instants; the provider compares them. `tenantText` is the login's current selection (SPEC IS-12).
import {
  HANDLERS,
  isRecord,
  isText,
  type LoginByProofInput,
  type LoginByProofOutput,
} from './schema.ts'
import { handler, isTrue, oneRow, text } from './support.ts'

export default handler<LoginByProofInput, LoginByProofOutput>(
  HANDLERS.loginByProof,
  raw =>
    isRecord(raw) && isText(raw['proofDigest']) && raw['proofDigest'] !== ''
      ? { proofDigest: raw['proofDigest'] }
      : undefined,
  (input, port) => {
    const row = oneRow(
      port,
      `SELECT l.login AS login, l.account AS account, l.tenant_text AS tenant_text,
          l.issued_at AS issued_at, l.max_deadline AS max_deadline,
          l.idle_deadline AS idle_deadline,
          EXISTS (SELECT 1 FROM id_login_revocation r WHERE r.login = l.login) AS revoked
         FROM id_login l WHERE l.proof_digest = ? LIMIT 1`,
      [input.proofDigest],
    )
    return {
      login:
        row === undefined
          ? null
          : {
              login: text(row['login']),
              account: text(row['account']),
              tenantText: text(row['tenant_text']),
              issuedAt: text(row['issued_at']),
              maxDeadline: text(row['max_deadline']),
              idleDeadline: text(row['idle_deadline']),
              revoked: isTrue(row['revoked']),
            },
    }
  },
)
