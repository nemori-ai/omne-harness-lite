import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import {
  evaluate,
  evaluationInputFingerprint,
  type CurrentEvaluationInputs,
  type NonConnectorEvaluationInput,
  type EffectiveAssembly,
} from '@omne-harness-lite/asset-evaluation'
import { copyJsonValue, readJsonStrict, isJsonNumber } from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  captureEnvironmentRequirement,
  sameEnvironmentScope,
  environmentBelongsTo,
  type EnvironmentCall,
  type EnvironmentPlacementSource,
  type PlacementRead,
  type EnvironmentPlacement,
} from '@omne-harness-lite/execution-environments'
import { ENVIRONMENT_PERMISSION_VALUES, toolDependencies } from '@omne-harness-lite/tool-definition'
import {
  environmentToolOf,
  type SelectedTool,
  type ExecutionSnapshot,
  type ToolRuntimeRegistryOperations,
} from '@omne-harness-lite/tool-execution-runtime'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import { jsonObject, sameJson } from './json-values.ts'

export const ToolEnvironmentPlacementConfig = z
  .object({
    name: z.string().min(1),
    factoryPermission: z.enum(ENVIRONMENT_PERMISSION_VALUES),
  })
  .strict()
export type ToolEnvironmentPlacementConfig = z.infer<typeof ToolEnvironmentPlacementConfig>

const rejected = (
  reason: 'invalidInput' | 'notAuthorized' | 'policyUnavailable' | 'unavailable',
): PlacementRead => ({ kind: 'rejected', reason })

/** A current input read may only use the original live execution's captured selection. */
function capturedSelection(
  snapshot: ExecutionSnapshot,
  scope: SessionScope,
  call: EnvironmentCall,
): SelectedTool | PlacementRead {
  if (
    !sameEnvironmentScope(snapshot.ref, scope) ||
    snapshot.ref.callId !== call.execution ||
    snapshot.state.phase === 'ended'
  )
    return rejected('notAuthorized')
  if (!snapshot.selected || !sameJson(environmentToolOf(snapshot.selected), call.tool))
    return rejected('notAuthorized')
  // The public observer owns and validates this snapshot. Copy it before the next input IO.
  const copied = copyJsonValue(snapshot.selected)
  return 'failed' in copied ? rejected('policyUnavailable') : (copied.ok as unknown as SelectedTool)
}

async function originalTool(
  tools: Pick<ToolRuntimeRegistryOperations, 'acquire'>,
  scope: SessionScope,
  authorization: SessionAccess,
  call: EnvironmentCall,
): Promise<SelectedTool | PlacementRead> {
  const result = await tools.acquire(authorization, { ...scope, callId: call.execution })
  if (result.kind !== 'acquired')
    return rejected(result.reason === 'notAuthorized' ? 'notAuthorized' : 'unavailable')
  try {
    const read = await result.observer.read()
    if (read.kind !== 'found')
      return rejected(read.reason === 'notAuthorized' ? 'notAuthorized' : 'unavailable')
    return capturedSelection(read.snapshot, scope, call)
  } finally {
    result.observer.release()
  }
}

function sameVersion(
  number: import('@omne-harness-lite/content-blocks').JsonNumber,
  represented: string,
) {
  const parsed = readJsonStrict(represented)
  return (
    'ok' in parsed &&
    isJsonNumber(parsed.ok) &&
    ExactDecimal.from(number).compare(ExactDecimal.from(parsed.ok)) === 0
  )
}

/** Current selection must still designate the exact original body; a new version is not substituted. */
function currentTool(
  input: NonConnectorEvaluationInput,
  assembly: EffectiveAssembly,
  selected: SelectedTool,
) {
  const asset = assembly.assets.find(
    value => capabilityCanonicalString(value.capability) === selected.capability,
  )
  if (!asset || asset.asset !== selected.asset || !sameVersion(asset.version, selected.version))
    return false
  const body = input.definitions
    .find(value => value.id === asset.asset)
    ?.versions.find(
      value => ExactDecimal.from(value.number).compare(ExactDecimal.from(asset.version)) === 0,
    )?.content
  return body?.category === 'tool' && sameJson(body.definition, selected.definition)
}

function effectivePlacement(
  input: NonConnectorEvaluationInput,
  assembly: EffectiveAssembly,
  selected: SelectedTool,
  scope: SessionScope,
  call: EnvironmentCall,
  config: ToolEnvironmentPlacementConfig,
): PlacementRead {
  if (!tenantIdEquals(input.tenant, scope.tenant)) return rejected('notAuthorized')
  if (!currentTool(input, assembly, selected)) return rejected('policyUnavailable')
  const values = assembly.values.filter(
    value => capabilityCanonicalString(value.capability) === selected.capability,
  )
  const requirement = captureEnvironmentRequirement(
    values.find(value => value.item === 'targetEnvironment')?.value,
  )
  const permission = values.find(value => value.item === 'executionEnvironment')
  const allowed = permission && jsonObject(permission.value) ? permission.value.allowed : undefined
  const decision =
    Array.isArray(allowed) && allowed.length === 1
      ? ENVIRONMENT_PERMISSION_VALUES.find(value => value === allowed[0])
      : undefined
  if (!requirement || !decision) return rejected('policyUnavailable')
  toolDependencies(selected.definition, requirement)
  const fingerprint = evaluationInputFingerprint(input)
  return {
    kind: 'placement',
    placement: {
      scope,
      ...call,
      requirement,
      permission: decision,
      revision: `${fingerprint}/${config.factoryPermission}`,
      evidence: {
        asset: selected.asset,
        version: selected.version,
        input: fingerprint,
        permissionFrom: permission?.from ?? 'factory',
        factoryPermission: config.factoryPermission,
      },
    },
  }
}

/** Real input evaluation is independent of Cordis; a live strategy is a trusted construction port. */
export function createToolEnvironmentPlacementSource(
  supplied: ToolEnvironmentPlacementConfig,
  dependencies: {
    readonly currentInputs: CurrentEvaluationInputs
    readonly tools: Pick<ToolRuntimeRegistryOperations, 'acquire'>
    readonly select: EnvironmentPlacementSource['select']
  },
): EnvironmentPlacementSource {
  const copied = copyJsonValue(supplied)
  if ('failed' in copied)
    throw new TypeError('ordinary environment placement configuration required')
  const config = ToolEnvironmentPlacementConfig.parse(copied.ok)
  const { currentInputs, tools, select } = dependencies
  async function read(
    scope: SessionScope,
    authorization: SessionAccess,
    call: EnvironmentCall,
  ): Promise<PlacementRead> {
    try {
      const selected = await originalTool(tools, scope, authorization, call)
      if ('kind' in selected) return selected
      if (selected.definition.settings?.targetEnvironment === undefined)
        return { kind: 'notApplicable' }
      const current = await currentInputs
        .read(scope.session, scope.tenant)
        .catch(() => ({ failure: 'unavailable' as const }))
      if ('failure' in current)
        return rejected(current.failure === 'invalidInput' ? 'invalidInput' : 'unavailable')
      const captured = copyJsonValue(current.input)
      if ('failed' in captured) return rejected('invalidInput')
      // evaluate validates this owned representation before any field grants an environment decision.
      const input = captured.ok as unknown as NonConnectorEvaluationInput
      const evaluated = evaluate(input, { toolEnvironmentPermission: config.factoryPermission })
      if (!('ok' in evaluated))
        return rejected('invalidInput' in evaluated ? 'invalidInput' : 'policyUnavailable')
      return effectivePlacement(input, evaluated.ok, selected, scope, call, config)
    } catch {
      return rejected('policyUnavailable')
    }
  }
  const source: EnvironmentPlacementSource = {
    name: config.name,
    generation: randomUUID(),
    read,
    select,
    async authorizeOperation(
      scope,
      authorization,
      adopted: EnvironmentPlacement,
      environment,
      facility,
    ) {
      if (
        !sameEnvironmentScope(adopted.scope, scope) ||
        !environmentBelongsTo(environment, scope, adopted) ||
        !adopted.requirement.facilities.includes(facility)
      )
        return { kind: 'rejected', reason: 'notAuthorized' }
      const latest = await read(scope, authorization, adopted)
      if (latest.kind !== 'placement')
        return {
          kind: 'rejected',
          reason:
            latest.kind === 'rejected' && latest.reason === 'notAuthorized'
              ? 'notAuthorized'
              : 'unavailable',
        }
      if (
        !latest.placement.requirement.facilities.includes(facility) ||
        (latest.placement.permission === 'never-allow' &&
          environment.bindingLayer === 'host_machine')
      )
        return { kind: 'rejected', reason: 'notAuthorized' }
      return { kind: 'authorized' }
    },
  }
  return Object.freeze(source)
}
