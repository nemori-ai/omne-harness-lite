import { copyJson } from '@omne-harness-lite/work-data'
import type { JsonObject, Money } from '@omne-harness-lite/work-data'
import { accepted, isRejected, rejected } from './result.ts'
import type { BudgetResult } from './result.ts'

const VALUE_LIMITS = { maxBytes: 1_000_000, maxDepth: 8, maxNodes: 32 }
const MAX_OPERATION_DIGITS = 100_000

function scaleIsValid(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function integerIsCanonical(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|-?[1-9][0-9]*)$/.test(value)
}

export function validateMoney(
  value: unknown,
  options: Readonly<{ nonNegative?: boolean }> = {},
): BudgetResult<Money> {
  const copied = copyJson(value, VALUE_LIMITS)
  if (!copied.ok) return rejected('money', copied.issues[0]?.message ?? 'invalid Money')
  if (copied.value === null || typeof copied.value !== 'object' || Array.isArray(copied.value)) {
    return rejected('money', 'Money must be an object')
  }
  const object = copied.value as JsonObject
  if (
    Object.keys(object).length !== 3 ||
    !Object.hasOwn(object, 'integer') ||
    !Object.hasOwn(object, 'scale') ||
    !Object.hasOwn(object, 'currency')
  ) {
    return rejected('money', 'Money must contain only integer, scale, and currency')
  }
  if (!integerIsCanonical(object.integer)) {
    return rejected('money', 'integer must be a canonical decimal integer', '/integer')
  }
  if (!scaleIsValid(object.scale)) {
    return rejected('money', 'scale must be a non-negative safe integer', '/scale')
  }
  if (typeof object.currency !== 'string' || object.currency.length === 0) {
    return rejected('money', 'currency must be a non-empty string', '/currency')
  }
  if (options.nonNegative === true && object.integer.startsWith('-')) {
    return rejected('money', 'amount must be non-negative', '/integer')
  }
  return accepted(
    Object.freeze({
      integer: object.integer,
      scale: object.scale,
      currency: object.currency,
    }),
  )
}

function checkedScale(scale: number): BudgetResult<number> {
  return scaleIsValid(scale)
    ? accepted(scale)
    : rejected('money', 'target scale must be a non-negative safe integer', '/scale')
}

function appendScale(integer: string, places: number): BudgetResult<string> {
  if (integer === '0' || places === 0) return accepted(integer)
  const signLength = integer.startsWith('-') ? 1 : 0
  if (integer.length - signLength + places > MAX_OPERATION_DIGITS) {
    return rejected('capacity', `rescaled integer exceeds ${MAX_OPERATION_DIGITS} digits`)
  }
  const sign = signLength === 1 ? '-' : ''
  return accepted(`${sign}${integer.slice(signLength)}${'0'.repeat(places)}`)
}

export function rescaleMoney(value: Money, scale: number): BudgetResult<Money> {
  const checked = validateMoney(value)
  if (isRejected(checked)) return checked
  const target = checkedScale(scale)
  if (isRejected(target)) return target
  if (checked.value.scale === target.value) return checked
  if (target.value > checked.value.scale) {
    const integer = appendScale(checked.value.integer, target.value - checked.value.scale)
    return isRejected(integer)
      ? integer
      : accepted(
          Object.freeze({
            integer: integer.value,
            scale: target.value,
            currency: checked.value.currency,
          }),
        )
  }
  const places = checked.value.scale - target.value
  if (checked.value.integer === '0') {
    return accepted(Object.freeze({ ...checked.value, scale: target.value }))
  }
  const sign = checked.value.integer.startsWith('-') ? '-' : ''
  const digits = sign === '' ? checked.value.integer : checked.value.integer.slice(1)
  if (places >= digits.length || !digits.endsWith('0'.repeat(places))) {
    return rejected('money', 'rescaling would lose precision', '/scale')
  }
  return accepted(
    Object.freeze({
      integer: `${sign}${digits.slice(0, -places)}`,
      scale: target.value,
      currency: checked.value.currency,
    }),
  )
}

function commonScale(left: Money, right: Money): BudgetResult<readonly [Money, Money]> {
  const checkedLeft = validateMoney(left)
  if (isRejected(checkedLeft)) return checkedLeft
  const checkedRight = validateMoney(right)
  if (isRejected(checkedRight)) return checkedRight
  if (checkedLeft.value.currency !== checkedRight.value.currency) {
    return rejected('currency', 'Money currencies must match')
  }
  const scale = Math.max(checkedLeft.value.scale, checkedRight.value.scale)
  const scaledLeft = rescaleMoney(checkedLeft.value, scale)
  if (isRejected(scaledLeft)) return scaledLeft
  const scaledRight = rescaleMoney(checkedRight.value, scale)
  if (isRejected(scaledRight)) return scaledRight
  return accepted(Object.freeze([scaledLeft.value, scaledRight.value]))
}

export function addMoney(left: Money, right: Money): BudgetResult<Money> {
  const common = commonScale(left, right)
  if (isRejected(common)) return common
  const integer = (BigInt(common.value[0].integer) + BigInt(common.value[1].integer)).toString()
  return accepted(
    Object.freeze({
      integer,
      scale: common.value[0].scale,
      currency: common.value[0].currency,
    }),
  )
}

export function subtractMoney(left: Money, right: Money): BudgetResult<Money> {
  const common = commonScale(left, right)
  if (isRejected(common)) return common
  const integer = (BigInt(common.value[0].integer) - BigInt(common.value[1].integer)).toString()
  return accepted(
    Object.freeze({
      integer,
      scale: common.value[0].scale,
      currency: common.value[0].currency,
    }),
  )
}

export function compareMoney(left: Money, right: Money): BudgetResult<-1 | 0 | 1> {
  const common = commonScale(left, right)
  if (isRejected(common)) return common
  const leftInteger = BigInt(common.value[0].integer)
  const rightInteger = BigInt(common.value[1].integer)
  return accepted(leftInteger < rightInteger ? -1 : leftInteger > rightInteger ? 1 : 0)
}

export function maxMoney(left: Money, right: Money): BudgetResult<Money> {
  const compared = compareMoney(left, right)
  if (isRejected(compared)) return compared
  const scale = Math.max(left.scale, right.scale)
  return rescaleMoney(compared.value < 0 ? right : left, scale)
}
