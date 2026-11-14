import type { Failure } from '@omne-harness/agent-contract'

const answered = new WeakSet<object>()
const wrapped = new WeakMap<object, object>()

export const answeredByPort = (failure: Failure): boolean => answered.has(failure)

function note(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'failure' in value) {
    const failure = (value as { failure: unknown }).failure
    if (typeof failure === 'object' && failure !== null) answered.add(failure)
  }
  return value
}

// The proxy stands over an empty target: production ports are frozen, and a proxy may not answer
// another value for a frozen property of its target. Keys and descriptors come from the original.
export function notingPorts<T extends object>(ports: T): T {
  const known = wrapped.get(ports)
  if (known !== undefined) return known as T
  const wrap = (value: unknown): unknown => {
    if (typeof value === 'function') {
      const member = value
      return new Proxy(() => undefined, {
        apply: (_target, _receiver, args: unknown[]) => {
          const result: unknown = Reflect.apply(member, ports, args)
          return result instanceof Promise ? result.then(note) : note(result)
        },
        get: (target, key, receiver) =>
          key in Function.prototype
            ? Reflect.get(target, key, receiver)
            : wrap(Reflect.get(member, key)),
      })
    }
    if (typeof value === 'object' && value !== null && !(value instanceof Promise))
      return notingPorts(value)
    return value
  }
  const proxy = new Proxy(Object.create(null) as T, {
    get: (_, key) => wrap(Reflect.get(ports, key, ports)),
    has: (_, key) => Reflect.has(ports, key),
    getPrototypeOf: () => Reflect.getPrototypeOf(ports),
    ownKeys: () => Reflect.ownKeys(ports),
    getOwnPropertyDescriptor: (_, key) => {
      const own = Reflect.getOwnPropertyDescriptor(ports, key)
      return own === undefined ? undefined : { ...own, configurable: true }
    },
  })
  wrapped.set(ports, proxy)
  return proxy
}
