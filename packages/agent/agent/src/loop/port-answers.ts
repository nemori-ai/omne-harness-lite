import type { Failure } from '@omne-harness/agent-contract'

// The failures that a port answered (Agent SPEC "依赖不可用时的等待"): a port's `unavailable` is a
// dependency that is not available now, and the run waits on it. A failure that the coordinator or
// the evaluator made is not a port's answer, so it keeps its own meaning (for example a stop).
const answered = new WeakSet<object>()
const wrapped = new WeakMap<object, object>()

/** Whether `failure` is the answer of a port, not one made inside the coordinator or evaluator. */
export const answeredByPort = (failure: Failure): boolean => answered.has(failure)

function note(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'failure' in value) {
    const failure = (value as { failure: unknown }).failure
    if (typeof failure === 'object' && failure !== null) answered.add(failure)
  }
  return value
}

/**
 * The same ports, with every failure that a method answers (directly or through its promise)
 * noted as a port's answer. Methods run on the original objects; nested port objects are wrapped
 * the same way, once each. The proxy stands over an empty target, because production ports are
 * frozen and a proxy may not answer another value for a frozen property of its target; keys and
 * descriptors are read from the original, so spreading a wrapped port keeps its members.
 */
export function notingPorts<T extends object>(ports: T): T {
  const known = wrapped.get(ports)
  if (known !== undefined) return known as T
  const wrap = (value: unknown): unknown => {
    if (typeof value === 'function')
      return (...args: unknown[]) => {
        const result: unknown = Reflect.apply(value, ports, args)
        return result instanceof Promise ? result.then(note) : note(result)
      }
    if (typeof value === 'object' && value !== null && !(value instanceof Promise))
      return notingPorts(value)
    return value
  }
  const proxy = new Proxy(Object.create(null) as T, {
    get: (_, key) => wrap(Reflect.get(ports, key, ports)),
    has: (_, key) => Reflect.has(ports, key),
    ownKeys: () => Reflect.ownKeys(ports),
    getOwnPropertyDescriptor: (_, key) => {
      const own = Reflect.getOwnPropertyDescriptor(ports, key)
      return own === undefined ? undefined : { ...own, configurable: true }
    },
  })
  wrapped.set(ports, proxy)
  return proxy
}
