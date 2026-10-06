import {
  captureEnvironmentAdoption,
  captureEnvironmentFacilities,
  matchesEnvironmentRequirement,
  sameEnvironmentScope,
  type EnvironmentAcquisition,
  type EnvironmentFacilities,
  type ExecutionEnvironmentOperations,
  type ResourceLifecycle,
} from '@omne-harness-lite/execution-environments'
import {
  captureToolJournalValue,
  environmentToolOf,
  type ExecutionRef,
  type ExecutionOrigin,
  type SelectedTool,
  type ToolJournalHistory,
  type ToolJournalPayload,
} from '@omne-harness-lite/tool-execution-runtime'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import type { createRuntimeJournal } from './runtime-journal.ts'
import { sameJson } from './json-values.ts'

type ResourceRecord = Extract<
  ToolJournalPayload,
  { kind: 'resource_planned' | 'resource_permitted' | 'physical_stop_observed' }
>
type Preparation =
  | { readonly kind: 'ready'; readonly facilities: EnvironmentFacilities }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'retained' }
type Held = Extract<EnvironmentAcquisition, { kind: 'acquired' }>

function adoptionState(history: ToolJournalHistory | undefined, value: Held) {
  if (!history?.started || history.terminal) return 'closed'
  if (!history.environment) return 'absent'
  return sameJson(
    history.environment.value.adoption as unknown as JsonValue,
    value.adoption as unknown as JsonValue,
  )
    ? 'same'
    : 'conflict'
}

function resourceState(
  history: ToolJournalHistory | undefined,
  value: ResourceRecord,
  closed: boolean,
) {
  if (!history) return 'unavailable'
  if (value.kind !== 'physical_stop_observed') {
    if (closed || history.terminal) return 'closed'
    if (!history.started) return 'unavailable'
  }
  return resourceGuard(history, value)
}

function requestedFacilities(
  facilities: EnvironmentFacilities,
  needed: readonly string[],
): EnvironmentFacilities | undefined {
  if (needed.some(name => name !== 'command' && name !== 'files')) return undefined
  return Object.freeze({
    description: facilities.description,
    ...(needed.includes('command') && facilities.command ? { command: facilities.command } : {}),
    ...(needed.includes('files') && facilities.files ? { files: facilities.files } : {}),
  })
}

/** Original resource relations; cleanup is independent of current user authority. */
function resourceGuard(
  history: ToolJournalHistory,
  value: ResourceRecord,
): 'append' | 'recorded' | 'conflict' | 'unavailable' {
  switch (value.kind) {
    case 'resource_planned': {
      const previous = history.resources.get(value.resource.key)
      if (!previous) return 'append'
      return sameJson(
        previous.planned.value.resource as unknown as JsonValue,
        value.resource as unknown as JsonValue,
      )
        ? 'recorded'
        : 'conflict'
    }
    case 'resource_permitted': {
      const previous = history.resources.get(value.key)
      if (!history.environment || !previous) return 'unavailable'
      return previous.permitted ? 'recorded' : 'append'
    }
    case 'physical_stop_observed':
      return history.resources.has(value.key) ? 'append' : 'unavailable'
  }
}

/** Holds one acquired lease across unknown journal receipts. No successor is acquired. */
export function createExecutionEnvironment(input: {
  readonly ref: ExecutionRef
  readonly origin: ExecutionOrigin
  readonly selected: SelectedTool
  readonly access: SessionAccess
  readonly journal: ReturnType<typeof createRuntimeJournal>
  readonly environments: Pick<ExecutionEnvironmentOperations, 'resolvePlacement' | 'acquire'>
  readonly closed: AbortSignal
  readonly clock: Clock
  readonly attempts: number
  readonly retry?: (attempt: number) => Promise<void>
  readonly invalidate: (reason: string) => void
}) {
  const scope = { tenant: input.ref.tenant, session: input.ref.session }
  const call = { execution: input.ref.callId, tool: environmentToolOf(input.selected) }
  let held: Held | undefined
  let released = false

  async function resourceRecord(supplied: ResourceRecord) {
    const captured = captureToolJournalValue(supplied)
    if ('invalid' in captured || captured.kind !== supplied.kind) return 'conflict' as const
    const value = captured as ResourceRecord
    const newEffect = value.kind !== 'physical_stop_observed'
    for (let attempt = 0; attempt < input.attempts; attempt++) {
      if (newEffect && input.closed.aborted) return 'closed' as const
      const view = await input.journal.read(scope, input.ref.callId)
      if (view.kind !== 'view') return 'unavailable' as const
      const decision = resourceState(
        view.executions.get(input.ref.callId),
        value,
        input.closed.aborted,
      )
      if (decision !== 'append') return decision
      const committed = await input.journal.commit({
        ref: input.ref,
        origin: input.origin,
        expected: view.prefix,
        values: [value],
      })
      if (committed.kind === 'view')
        return newEffect && input.closed.aborted ? ('closed' as const) : ('recorded' as const)
      if (committed.reason !== 'tailChanged') return 'unavailable' as const
      await input.retry?.(attempt)
    }
    return 'unavailable' as const
  }

  const resources: ResourceLifecycle = {
    closed: input.closed,
    plan(resource) {
      return resourceRecord({ kind: 'resource_planned', revision: 1, ref: input.ref, resource })
    },
    async permit(key) {
      const result = await resourceRecord({
        kind: 'resource_permitted',
        revision: 1,
        ref: input.ref,
        key,
      })
      return result === 'recorded' ? 'confirmed' : result === 'closed' ? 'closed' : 'unavailable'
    },
    async stopped(key, status) {
      const at = input.clock.now()
      if (at === 'unavailable') return 'unavailable'
      const result = await resourceRecord({
        kind: 'physical_stop_observed',
        revision: 1,
        ref: input.ref,
        key,
        status,
        at: instantToRfc3339(at),
      })
      return result === 'recorded' ? result : 'unavailable'
    },
  }

  async function acquire(): Promise<Held | Extract<Preparation, { kind: 'rejected' }>> {
    const resolved = await input.environments.resolvePlacement(scope, input.access, call)
    if (resolved.kind !== 'placement')
      return {
        kind: 'rejected',
        reason:
          resolved.kind === 'rejected'
            ? `environment:${resolved.reason}`
            : 'environment:notApplicable',
      }
    if (input.closed.aborted) return { kind: 'rejected', reason: 'environment:closed' }
    const result = await input.environments.acquire({
      scope,
      authorization: input.access,
      call,
      requirement: resolved.placement.requirement,
      resources,
    })
    if (result.kind !== 'acquired')
      return { kind: 'rejected', reason: `environment:${result.reason}` }
    held = result
    void result.lease.invalidated.then(
      value => input.invalidate(value.reason),
      () => input.invalidate('environment_invalidated'),
    )
    return result
  }

  function validatedFacilities(value: Held) {
    const adoption = captureEnvironmentAdoption(value.adoption),
      facilities = captureEnvironmentFacilities(value.lease.facilities)
    if (!adoption || !facilities) return undefined
    if (
      !sameEnvironmentScope(adoption.placement.scope, scope) ||
      adoption.placement.execution !== call.execution ||
      !sameJson(adoption.placement.tool, call.tool)
    )
      return undefined
    if (
      !sameJson(adoption.description, facilities.description) ||
      !matchesEnvironmentRequirement(facilities.description, adoption.placement.requirement)
    )
      return undefined
    const requested = requestedFacilities(facilities, adoption.placement.requirement.facilities)
    return requested ? { facilities: requested, adoption } : undefined
  }

  async function adopt(value: Held, facilities: EnvironmentFacilities): Promise<Preparation> {
    for (let attempt = 0; attempt < input.attempts; attempt++) {
      if (input.closed.aborted) return { kind: 'rejected', reason: 'environment:closed' }
      const view = await input.journal.read(scope, input.ref.callId)
      if (view.kind !== 'view') return { kind: 'retained' }
      if (input.closed.aborted) return { kind: 'rejected', reason: 'environment:closed' }
      const state = adoptionState(view.executions.get(input.ref.callId), value)
      if (state === 'closed') return { kind: 'rejected', reason: 'environment:closed' }
      if (state === 'same') return { kind: 'ready', facilities }
      if (state === 'conflict') return { kind: 'rejected', reason: 'environment:adoptionConflict' }
      const committed = await input.journal.commit({
        ref: input.ref,
        origin: input.origin,
        expected: view.prefix,
        values: [
          {
            kind: 'execution_environment_adopted',
            revision: 1,
            ref: input.ref,
            adoption: value.adoption,
          },
        ],
      })
      if (committed.kind === 'view')
        return input.closed.aborted
          ? { kind: 'rejected', reason: 'environment:closed' }
          : { kind: 'ready', facilities }
      if (committed.reason !== 'tailChanged') return { kind: 'retained' }
      await input.retry?.(attempt)
    }
    return { kind: 'retained' }
  }

  return Object.freeze({
    async prepare(): Promise<Preparation> {
      if (input.closed.aborted || released)
        return { kind: 'rejected', reason: 'environment:closed' }
      let value: Awaited<ReturnType<typeof acquire>>
      try {
        value = held ?? (await acquire())
      } catch {
        return { kind: 'rejected', reason: 'environment:unavailable' }
      }
      if (value.kind !== 'acquired') return value
      const validated = validatedFacilities(value)
      if (!validated) return { kind: 'rejected', reason: 'environment:missingFacility' }
      held = { ...value, adoption: validated.adoption }
      return adopt(held, validated.facilities)
    },
    async release(): Promise<'released' | 'pending'> {
      if (!held || released) return 'released'
      try {
        const result = await held.lease.release()
        if (result.kind !== 'released') return 'pending'
        held = undefined
        released = true
        return 'released'
      } catch {
        return 'pending'
      }
    },
  })
}
