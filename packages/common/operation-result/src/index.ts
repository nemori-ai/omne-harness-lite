export type Outcome<T, F> = { ok: T } | { failure: F }

export type Ack<F> = { ok: true } | { failure: F }

export function succeed<T>(value: T): Outcome<T, never> {
  return { ok: value }
}

export function ack<F = never>(): Ack<F> {
  return { ok: true }
}

export function fail<F>(failure: F): Outcome<never, F> {
  return { failure }
}

export function isSuccess<T, F>(
  result: Outcome<T, F> | Ack<F>,
): result is { ok: T } | { ok: true } {
  return typeof result === 'object' && result !== null && 'ok' in result
}
