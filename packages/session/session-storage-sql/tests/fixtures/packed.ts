import { packText, unpackText } from '@omne-harness/sql-contract/worker'

export { packText, unpackText }

export const packedLiteral = (text: string): string =>
  `X'${Buffer.from(packText(text)).toString('hex')}'`

export const unpacked = (cell: unknown): string => {
  if (!(cell instanceof Uint8Array)) throw new TypeError('a packed BLOB cell was expected')
  return unpackText(cell)
}
