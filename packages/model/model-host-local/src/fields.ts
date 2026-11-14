export function isRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function fieldOf(value: unknown, key: string): unknown {
  return isRecord(value) ? Reflect.get(value, key) : undefined
}

export function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

type Issue = { message: string }

export type Parsed<T> = Readonly<{ value: T }> | Readonly<{ issues: Issue[] }>

export function rejected(message: string): Parsed<never> {
  return { issues: [{ message }] }
}
