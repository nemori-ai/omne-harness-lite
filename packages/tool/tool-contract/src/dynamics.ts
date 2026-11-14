import { workspaceEquals } from '@omne-harness/legal-identity'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolBindingKey, ToolShape, ToolShapeParameters } from './authoring.ts'
import type {
  ParameterContract,
  SourceLayer,
  ToolDefinition,
  ToolGovernance,
  ToolImplementationFacts,
} from './definitions.ts'
import type { DurableEvidence } from './identity.ts'

export function deriveDefinition(
  governance: ToolGovernance,
  facts: ToolImplementationFacts,
): ToolDefinition {
  const shared = {
    adoption: governance.asset.adoption,
    name: governance.asset.name,
    description: facts.description,
    requiredCapabilities: governance.requiredCapabilities,
    backgroundAllowed: facts.backgroundAllowed,
    declarations: facts.declarations,
    ...(governance.programmable === undefined ? {} : { programmable: governance.programmable }),
  }
  return Object.freeze({ ...shared, ...facts.implements })
}

export function canonicalJsonText(value: JsonValue): string {
  return writeJsonText(sortKeys(value))
}

function sortKeys(value: JsonValue): JsonValue {
  if (value.kind === 'array') return { kind: 'array', items: value.items.map(sortKeys) }
  if (value.kind !== 'object') return value
  const entries = [...value.entries]
    .sort((left, right) => compareText(left.key, right.key))
    .map(entry => ({ key: entry.key, value: sortKeys(entry.value) }))
  return { kind: 'object', entries }
}

function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function shapeParameters(contract: ParameterContract): ToolShapeParameters {
  return Object.freeze({
    kind: 'declared',
    schema: canonicalJsonText(contract.schema),
    vocabulary: Object.freeze({
      owner: contract.vocabulary.owner,
      name: contract.vocabulary.name,
      digest: contract.vocabulary.digest,
    }),
  })
}

const EXECUTOR_OWNED: ToolShapeParameters = Object.freeze({ kind: 'executor-owned' })

export function shapeOf(definition: ToolDefinition): ToolShape {
  if (definition.kind === 'function')
    return Object.freeze({
      name: definition.name,
      kind: 'function',
      parameters: shapeParameters(definition.parameters),
    })
  const commands = [...definition.commands]
    .sort((left, right) => compareText(left.name, right.name))
    .map(command =>
      Object.freeze({
        name: command.name,
        parameters:
          command.parameters.kind === 'declared'
            ? shapeParameters(command.parameters.value)
            : EXECUTOR_OWNED,
      }),
    )
  return Object.freeze({
    name: definition.name,
    kind: 'commands',
    commands: Object.freeze(commands),
  })
}

function parametersText(parameters: ToolShapeParameters): string {
  if (parameters.kind === 'executor-owned') return 'executor-owned'
  const { owner, name, digest } = parameters.vocabulary
  return JSON.stringify(['declared', owner, name, digest, parameters.schema])
}

function shapeText(shape: ToolShape): string {
  if (shape.kind === 'function')
    return JSON.stringify(['function', shape.name, parametersText(shape.parameters)])
  const commands = [...shape.commands]
    .sort((left, right) => compareText(left.name, right.name))
    .map(command => [command.name, parametersText(command.parameters)])
  return JSON.stringify(['commands', shape.name, commands])
}

export function sameShape(left: ToolShape, right: ToolShape): boolean {
  return shapeText(left) === shapeText(right)
}

export function sameSourceLayer(left: SourceLayer, right: SourceLayer): boolean {
  switch (left.kind) {
    case 'official':
      return right.kind === 'official'
    case 'organization':
      return right.kind === 'organization' && left.organization.text === right.organization.text
    case 'tenant':
      return (
        right.kind === 'tenant' &&
        left.tenant.organization.text === right.tenant.organization.text &&
        left.tenant.account.text === right.tenant.account.text
      )
    case 'workspace':
      return right.kind === 'workspace' && workspaceEquals(left.workspace, right.workspace)
    default: {
      const unreachable: never = left
      return unreachable
    }
  }
}

export function sameBindingKey(left: ToolBindingKey, right: ToolBindingKey): boolean {
  const { adoption: a } = left.asset
  const { adoption: b } = right.asset
  return (
    sameSourceLayer(left.layer, right.layer) &&
    left.asset.name === right.asset.name &&
    a.owner === b.owner &&
    a.name === b.name &&
    a.revision === b.revision &&
    a.digest === b.digest
  )
}

export type ToolReloadResult =
  | Readonly<{ kind: 'loaded' }>
  | Readonly<{ kind: 'recognized' }>
  | Readonly<{ kind: 'missing'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'conflict'; usable: boolean }>
  | Readonly<{ kind: 'draining' }>

export type FreezeVerdict = Readonly<{ cause: 'tool-shape-lost'; evidence: DurableEvidence }>

export type AdoptionFacts = Readonly<{
  recorded: Readonly<{ key: ToolBindingKey; shape: ToolShape; usable: boolean }>
  sameShape: readonly ToolBindingKey[]
  winner: Readonly<{ key: ToolBindingKey; shape: ToolShape }> | null
  reload: ToolReloadResult | null
}>

export type AdoptionPlan =
  | Readonly<{ kind: 'advance'; key: ToolBindingKey }>
  | Readonly<{ kind: 'keep'; key: ToolBindingKey }>
  | Readonly<{ kind: 'fallback'; key: ToolBindingKey }>
  | Readonly<{ kind: 'reload'; key: ToolBindingKey }>
  | Readonly<{ kind: 'replacement' }>
  | Readonly<{ kind: 'freeze'; verdict: FreezeVerdict }>

const REPLACEMENT: AdoptionPlan = Object.freeze({ kind: 'replacement' })

export function planAdoption(facts: AdoptionFacts): AdoptionPlan {
  const { recorded, winner } = facts
  const winnerSameShape = winner !== null && sameShape(winner.shape, recorded.shape)
  if (winnerSameShape) return Object.freeze({ kind: 'advance', key: winner.key })
  if (recorded.usable) return Object.freeze({ kind: 'keep', key: recorded.key })
  const [fallback] = facts.sameShape
  if (fallback !== undefined) return Object.freeze({ kind: 'fallback', key: fallback })
  if (facts.reload === null) return Object.freeze({ kind: 'reload', key: recorded.key })
  return afterReload(facts.reload, recorded.key, winner !== null)
}

function afterReload(
  reload: ToolReloadResult,
  recorded: ToolBindingKey,
  differentWinner: boolean,
): AdoptionPlan {
  switch (reload.kind) {
    case 'loaded':
    case 'recognized':
      return Object.freeze({ kind: 'keep', key: recorded })
    case 'conflict':
      return reload.usable ? Object.freeze({ kind: 'keep', key: recorded }) : REPLACEMENT
    case 'missing':
    case 'rejected':
      return differentWinner
        ? Object.freeze({
            kind: 'freeze',
            verdict: Object.freeze({ cause: 'tool-shape-lost', evidence: reload.evidence }),
          })
        : REPLACEMENT
    case 'unavailable':
    case 'denied':
    case 'invalid':
    case 'draining':
      return REPLACEMENT
    default: {
      const unreachable: never = reload
      return unreachable
    }
  }
}

export type RefreshFacts = Readonly<{
  recorded: Readonly<{ key: ToolBindingKey; usable: boolean }>
  sameShape: readonly ToolBindingKey[]
}>

export type RefreshOutcome =
  | Readonly<{ kind: 'available'; key: ToolBindingKey }>
  | Readonly<{ kind: 'routed'; key: ToolBindingKey }>
  | Readonly<{ kind: 'unavailable' }>

export function refreshAvailability(facts: RefreshFacts): RefreshOutcome {
  if (facts.recorded.usable) return Object.freeze({ kind: 'available', key: facts.recorded.key })
  const [fallback] = facts.sameShape
  if (fallback !== undefined) return Object.freeze({ kind: 'routed', key: fallback })
  return Object.freeze({ kind: 'unavailable' })
}

export type ResidentTool = Readonly<{
  definition: ToolDefinition
  shape: ToolShape
  key: ToolBindingKey
}>

export type ResidentFoldFailure =
  | Readonly<{ kind: 'already-resident'; name: string }>
  | Readonly<{ kind: 'shape-mismatch'; name: string }>

export function foldResident(
  resident: readonly ResidentTool[],
  admitted: ResidentTool,
): Outcome<readonly ResidentTool[], ResidentFoldFailure> {
  const { name } = admitted.definition
  if (resident.some(item => item.definition.name === name))
    return fail({ kind: 'already-resident', name })
  if (!sameShape(shapeOf(admitted.definition), admitted.shape))
    return fail({ kind: 'shape-mismatch', name })
  return succeed(Object.freeze([...resident, admitted]))
}
