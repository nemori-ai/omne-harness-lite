// `identity.issue-basis`: the account row and the credential material of one login identifier,
// read in one snapshot. The second statement reads the login table once, so a read that answers
// proves the login table is readable before the provider compares the credential (DP3-C9 step 3).
import {
  HANDLERS,
  isRecord,
  isText,
  type IssueBasisInput,
  type IssueBasisOutput,
} from './schema.ts'
import { handler, oneRow, text } from './support.ts'

export default handler<IssueBasisInput, IssueBasisOutput>(
  HANDLERS.issueBasis,
  raw =>
    isRecord(raw) && isText(raw['loginIdentifier']) && raw['loginIdentifier'] !== ''
      ? { loginIdentifier: raw['loginIdentifier'] }
      : undefined,
  (input, port) => {
    const row = oneRow(
      port,
      `SELECT a.account AS account, a.personal_organization AS organization, c.material AS material
         FROM id_account a JOIN id_credential c ON c.account = a.account
        WHERE a.login_identifier = ? LIMIT 1`,
      [input.loginIdentifier],
    )
    port.execute('SELECT login FROM id_login LIMIT 1', [])
    return {
      account:
        row === undefined
          ? null
          : {
              account: text(row['account']),
              organization: text(row['organization']),
              material: text(row['material']),
            },
    }
  },
)
