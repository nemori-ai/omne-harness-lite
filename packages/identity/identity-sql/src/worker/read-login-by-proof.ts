// `identity.login-by-proof`: the login row of one proof digest. The proof itself never reaches
// the Worker (DP3-C10). Deadlines travel as encoded instants; the provider compares them.
import {
  HANDLERS,
  isRecord,
  isText,
  type LoginByProofInput,
  type LoginByProofOutput,
} from './schema.ts'
import { handler, oneRow, text } from './support.ts'

export default handler<LoginByProofInput, LoginByProofOutput>(
  HANDLERS.loginByProof,
  raw =>
    isRecord(raw) && isText(raw['proofDigest']) && raw['proofDigest'] !== ''
      ? { proofDigest: raw['proofDigest'] }
      : undefined,
  (input, port) => {
    const row = oneRow(
      port,
      `SELECT login, account, tenant_text, issued_at, max_deadline, idle_deadline
         FROM id_login WHERE proof_digest = ? LIMIT 1`,
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
            },
    }
  },
)
