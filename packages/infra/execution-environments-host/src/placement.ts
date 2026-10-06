import {
  captureEnvironmentPlacement,
  captureEnvironmentReference,
  sameEnvironmentScope,
  type EnvironmentPlacement,
  type EnvironmentPlacementSource,
  type EnvironmentPlacementRegistrations,
  type EnvironmentDescription,
  type EnvironmentCall,
  type EnvironmentRequirement,
  type EnvironmentRejection,
} from '@omne-harness-lite/execution-environments'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'

const rejected = (reason: EnvironmentRejection['reason']): EnvironmentRejection => ({
  kind: 'rejected',
  reason,
})
interface Entry {
  readonly source: EnvironmentPlacementSource
  readonly jobs: Set<Promise<unknown>>
  dispose(): Promise<void>
}
export interface PlacementTicket {
  readonly entry: Entry
  readonly placement: EnvironmentPlacement
}
export interface PlacementRequest {
  readonly scope: SessionScope
  readonly authorization: SessionAccess
  readonly call: EnvironmentCall
  readonly requirement: EnvironmentRequirement
}
const sameCall = (a: EnvironmentCall, b: EnvironmentCall) =>
  a.execution === b.execution &&
  a.tool.name === b.tool.name &&
  a.tool.definition === b.tool.definition
const sameRequirement = (a: EnvironmentRequirement, b: EnvironmentRequirement) =>
  a.bindingLayer === b.bindingLayer &&
  a.facilities.length === b.facilities.length &&
  a.facilities.every(key => b.facilities.includes(key))
/** The trusted contribution is unique. Caller-controlled metadata never selects its authority. */
export function createPlacementAuthority(active: () => boolean) {
  let current: Entry | undefined
  const retiring = new Set<Entry>()
  const live = (entry: Entry) => active() && current === entry
  async function observe<T>(entry: Entry, operation: () => Promise<T>): Promise<T> {
    const job = Promise.resolve().then(operation)
    entry.jobs.add(job)
    try {
      return await job
    } finally {
      entry.jobs.delete(job)
    }
  }
  async function read(
    entry: Entry,
    input: PlacementRequest,
  ): Promise<PlacementTicket | EnvironmentRejection> {
    if (!live(entry)) return rejected('policyUnavailable')
    try {
      const result = await observe(entry, () =>
        entry.source.read(input.scope, input.authorization, input.call),
      )
      if (!live(entry)) return rejected('placementChanged')
      if (result.kind === 'notApplicable') return rejected('notApplicable')
      if (result.kind === 'rejected')
        return ['invalidInput', 'notAuthorized', 'policyUnavailable', 'unavailable'].includes(
          result.reason,
        )
          ? rejected(result.reason)
          : rejected('policyUnavailable')
      if (result.kind !== 'placement') return rejected('policyUnavailable')
      const placement = captureEnvironmentPlacement(result.placement)
      if (
        !placement ||
        !sameEnvironmentScope(placement.scope, input.scope) ||
        !sameCall(placement, input.call) ||
        !sameRequirement(placement.requirement, input.requirement)
      )
        return rejected('placementChanged')
      return { entry, placement }
    } catch {
      return rejected('policyUnavailable')
    }
  }
  const registrations: EnvironmentPlacementRegistrations = {
    registerPlacementSource(input) {
      if (!active()) throw new Error('environment registry stopped')
      if (
        !input ||
        typeof input.name !== 'string' ||
        !input.name ||
        typeof input.generation !== 'string' ||
        !input.generation ||
        ![input.read, input.select, input.authorizeOperation].every(
          value => typeof value === 'function',
        )
      )
        throw new TypeError('invalid placement source')
      if (current) throw new Error('duplicate placement source')
      let drained: Promise<void> | undefined
      const entry: Entry = {
        source: Object.freeze({
          name: input.name,
          generation: input.generation,
          read: input.read.bind(input),
          select: input.select.bind(input),
          authorizeOperation: input.authorizeOperation.bind(input),
        }),
        jobs: new Set(),
        dispose() {
          if (drained) return drained
          if (current === entry) current = undefined
          retiring.add(entry)
          drained = Promise.allSettled([...entry.jobs]).then(() => {
            retiring.delete(entry)
          })
          return drained
        },
      }
      current = entry
      return entry.dispose
    },
  }
  return {
    registrations,
    current(ticket: PlacementTicket) {
      return live(ticket.entry)
    },
    read(input: PlacementRequest) {
      return current ? read(current, input) : Promise.resolve(rejected('policyUnavailable'))
    },
    async recheck(ticket: PlacementTicket, input: PlacementRequest) {
      const latest = await read(ticket.entry, input)
      if ('kind' in latest) return latest
      return writeJsonLossless(latest.placement) === writeJsonLossless(ticket.placement)
        ? undefined
        : rejected('placementChanged')
    },
    async select(ticket: PlacementTicket, candidates: readonly EnvironmentDescription[]) {
      if (!live(ticket.entry)) return rejected('placementChanged')
      try {
        const choice = await observe(ticket.entry, () =>
          ticket.entry.source.select(ticket.placement, candidates),
        )
        if (!live(ticket.entry)) return rejected('placementChanged')
        if (choice.kind === 'rejected')
          return ['policyUnavailable', 'ambiguousEnvironment', 'noMatchingEnvironment'].includes(
            choice.reason,
          )
            ? rejected(choice.reason)
            : rejected('policyUnavailable')
        const reference =
          choice.kind === 'selected' ? captureEnvironmentReference(choice.reference) : undefined
        if (
          !reference ||
          !candidates.some(
            item =>
              item.reference.provider === reference.provider &&
              writeJsonLossless(item.reference.reference) ===
                writeJsonLossless(reference.reference),
          )
        )
          return rejected('policyUnavailable')
        return { reference }
      } catch {
        return rejected('policyUnavailable')
      }
    },
    async authorize(
      ticket: PlacementTicket,
      input: PlacementRequest,
      environment: EnvironmentDescription,
      facility: 'command' | 'files',
    ) {
      if (!live(ticket.entry)) return { kind: 'rejected', reason: 'closed' } as const
      try {
        const result = await observe(ticket.entry, () =>
          ticket.entry.source.authorizeOperation(
            input.scope,
            input.authorization,
            ticket.placement,
            environment,
            facility,
          ),
        )
        if (!live(ticket.entry)) return { kind: 'rejected', reason: 'closed' } as const
        if (result.kind === 'authorized') return result
        return {
          kind: 'rejected',
          reason:
            result.kind === 'rejected' && result.reason === 'notAuthorized'
              ? 'notAuthorized'
              : 'unavailable',
        } as const
      } catch {
        return { kind: 'rejected', reason: 'unavailable' } as const
      }
    },
    async drain() {
      await Promise.all(
        [...new Set([...(current ? [current] : []), ...retiring])].map(entry => entry.dispose()),
      )
    },
  }
}
