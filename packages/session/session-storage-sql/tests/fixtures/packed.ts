// The packed text form of the large text columns (sql-contract §10.1) as the tests plant and read
// raw rows: `sl_entry.entry`, `sl_operation.receipt` and `result`, `sl_state_item.value`,
// `er_fact.event` and `body`, `sl_blob.payload`.
import { packText, unpackText } from '@omne-harness/sql-contract/worker'

export { packText, unpackText }

/** A SQL blob literal of the packed `text`, for a row planted by a SQL text. */
export const packedLiteral = (text: string): string =>
  `X'${Buffer.from(packText(text)).toString('hex')}'`

/** The text of a raw packed cell. */
export const unpacked = (cell: unknown): string => {
  if (!(cell instanceof Uint8Array)) throw new TypeError('a packed BLOB cell was expected')
  return unpackText(cell)
}
