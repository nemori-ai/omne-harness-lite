/** What crosses a port: data alone, so that where the code of a plugin runs is not part of the contract. */
export type PortData =
  | null
  | boolean
  | number
  | string
  | readonly PortData[]
  | Readonly<{ [key: string]: PortData }>

export type PortAnswer =
  | Readonly<{ outcome: 'done'; value: PortData }>
  | Readonly<{ outcome: 'refused'; reason: string }>
  | Readonly<{ outcome: 'unavailable'; reason: string }>
  | Readonly<{ outcome: 'unknown' }>
  | Readonly<{ outcome: 'closed' }>

/** One port: each method takes one piece of data and answers one. There is no place for a tenant, a principal or a function. */
export type Port = Readonly<Record<string, (input: PortData) => Promise<PortAnswer>>>

/** What the owner of a port places: given the caller of one call, the port that acts as that caller. Only the loader calls it. */
export type PortFactory<Caller> = (caller: Caller) => Port

export type Bound = Readonly<{ ports: Readonly<Record<string, Port>>; close(): void }>

const plain = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function copyOf(value: unknown): PortData | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const items = value.map(copyOf)
    return items.includes(undefined) ? undefined : (items as PortData[])
  }
  if (typeof value !== 'object' || !plain(value)) return undefined
  const entries = Object.entries(value).map(([key, item]) => [key, copyOf(item)] as const)
  return entries.some(([, item]) => item === undefined)
    ? undefined
    : (Object.fromEntries(entries) as Readonly<{ [key: string]: PortData }>)
}

/** What a domain answered, as a copy: nothing the plugin holds afterwards is the domain's own. */
function answerOf(name: string, answer: PortAnswer): PortAnswer {
  switch (answer.outcome) {
    case 'done': {
      const value = copyOf(answer.value)
      return value === undefined
        ? { outcome: 'unavailable', reason: `${name} answered what is not data` }
        : { outcome: 'done', value }
    }
    case 'refused':
    case 'unavailable':
      return { outcome: answer.outcome, reason: String(answer.reason) }
    case 'unknown':
    case 'closed':
      return { outcome: answer.outcome }
  }
}

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** The ports of one call, opened as its caller. Closed, each method answers `closed` and no domain is called. */
export function bindPorts<Caller>(
  factories: Readonly<Record<string, () => PortFactory<Caller> | undefined>>,
  caller: Caller,
): Bound {
  let open = true
  const portOf = (name: string, factory: () => PortFactory<Caller> | undefined): Port =>
    new Proxy(Object.freeze({}), {
      get: (_target, method) =>
        typeof method !== 'string' || method === 'then'
          ? undefined
          : async (input: unknown): Promise<PortAnswer> => {
              if (!open) return { outcome: 'closed' }
              const data = copyOf(input)
              if (data === undefined) return { outcome: 'refused', reason: 'the input is not data' }
              const made = factory()
              if (made === undefined)
                return { outcome: 'unavailable', reason: `${name} is not there now` }
              try {
                const call = made(caller)[String(method)]
                if (call === undefined)
                  return { outcome: 'refused', reason: `${name} has no method ${String(method)}` }
                return answerOf(name, await call(data))
              } catch (error) {
                return { outcome: 'unavailable', reason: reasonOf(error) }
              }
            },
    }) as Port
  const ports = Object.freeze(
    Object.fromEntries(Object.entries(factories).map(([name, made]) => [name, portOf(name, made)])),
  )
  return { ports, close: () => void (open = false) }
}
