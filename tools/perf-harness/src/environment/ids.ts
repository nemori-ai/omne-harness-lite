import { createHash } from 'node:crypto'
import type { Machine } from './machine.ts'

type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }

/** One text for one value, whatever order its keys were written in. */
export function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as { readonly [key: string]: Json })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
  return `{${entries.join(',')}}`
}

const idOf = (prefix: string, value: Json): string =>
  `${prefix}-${createHash('sha256').update(canonical(value)).digest('hex').slice(0, 12)}`

/** Where it ran: the identity of the machine, and nothing of its state. */
export const configIdOf = (machine: Machine): string => idOf('cfg', machine as unknown as Json)

/** How the measured object was put together. */
export const assemblyIdOf = (assembly: Json): string => idOf('asm', assembly)

/** What was asked of it. */
export const workloadIdOf = (workload: Json): string => idOf('wl', workload)

export type { Json }
