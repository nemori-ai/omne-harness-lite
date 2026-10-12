declare const governanceCenterIdBrand: unique symbol

/** S-27：128 位随机值的规范形式，恰为 32 个小写十六进制字符；相等即逐字符相等。 */
export type GovernanceCenterId = string & { readonly [governanceCenterIdBrand]: true }

const CANONICAL = /^[0-9a-f]{32}$/

export function isGovernanceCenterId(value: unknown): value is GovernanceCenterId {
  return typeof value === 'string' && CANONICAL.test(value)
}
