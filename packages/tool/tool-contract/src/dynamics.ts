// The object chain and the resident rules R1–R5 as pure functions (RFC-0012): `deriveDefinition`
// composes a definition from the asset governance and the implementation facts; `shapeOf` reads
// the same-shape projection; `planAdoption` is the adoption-point table; `refreshAvailability` is
// the mid-Run rule; `foldResident` keeps the resident set that only grows. None of them reads a
// registry, a clock or a store: the caller gathers the facts and the functions judge them.
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

/**
 * Composes the definition of a loaded tool. The name, the adoption, the required capabilities
 * and `programmable` come from the asset; the shape, the description, `backgroundAllowed` and the
 * declarations come from the implementation. `programmable` stays omitted when the asset omits
 * it. The function checks nothing: the loader checks the asset name against the capability name,
 * and `judgeToolDefinition` checks an untrusted value.
 */
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

/** Canonical JSON text of a tree: object entries sorted by key, lexemes and order kept otherwise. */
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

/** Code-unit order, so the same names sort the same way everywhere. */
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

/**
 * The same-shape projection of a definition (R1–R5): name, kind, the parameter contract as
 * canonical JSON with the owner, name and digest of its vocabulary, and the command table sorted
 * by name. Descriptions, summaries, returns, declarations, adoption and executor take no part.
 */
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

/** A fixed text of a shape, so two shapes compare the same whatever the order of their fields. */
function shapeText(shape: ToolShape): string {
  if (shape.kind === 'function')
    return JSON.stringify(['function', shape.name, parametersText(shape.parameters)])
  const commands = [...shape.commands]
    .sort((left, right) => compareText(left.name, right.name))
    .map(command => [command.name, parametersText(command.parameters)])
  return JSON.stringify(['commands', shape.name, commands])
}

/** Whether two shapes are the same shape (R1–R5). */
export function sameShape(left: ToolShape, right: ToolShape): boolean {
  return shapeText(left) === shapeText(right)
}

/**
 * Whether two source layers are the same position with the same identity (G7). The organization
 * and tenant branches compare the identity texts. The workspace branch uses `workspaceEquals`, so
 * it needs minted values (from `workspaceCodec.parse`, as `judgeFixedToolRequest` returns them): a
 * workspace that was copied through JSON, `structuredClone` or a message is not equal to anything.
 * The organization and tenant branches are not yet moved onto their codecs (a separate card).
 */
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

/** Whether two binding keys name the same layer, capability and asset version (G7). */
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

/**
 * What the generation coordinator answered when the adoption point asked it to reload the
 * recorded key. `missing` and `rejected` are durable failures and carry the evidence the
 * coordinator minted; `unavailable` is temporary; `denied` and `invalid` are a withdrawn
 * qualification; `conflict` says another contribution holds the key and whether it is usable;
 * `draining` counts as not usable.
 */
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

/** The freeze judgment of R5b. The session executes the state change; Tool only judges. */
export type FreezeVerdict = Readonly<{ cause: 'tool-shape-lost'; evidence: DurableEvidence }>

/**
 * The facts of one resident item at an adoption point. `recorded.usable` is whether the recorded
 * key is live, not draining and accessible to this session (G7). `sameShape` lists the same-shape
 * contributions this session may use, live and not draining, in fallback order. `winner` is the
 * legal winner of the layer evaluation. `reload` is the coordinator's answer to the reload of the
 * recorded key, or null when the coordinator was not asked yet.
 */
export type AdoptionFacts = Readonly<{
  recorded: Readonly<{ key: ToolBindingKey; shape: ToolShape; usable: boolean }>
  sameShape: readonly ToolBindingKey[]
  winner: Readonly<{ key: ToolBindingKey; shape: ToolShape }> | null
  reload: ToolReloadResult | null
}>

/**
 * The adoption-point verdict. `advance` moves the recorded key to the winner; `keep` keeps it
 * (R5a); `fallback` moves it to the first same-shape contribution in fallback order; `reload`
 * asks the caller to have the coordinator reload the recorded key and call again with its
 * answer; `replacement` is the same-shape unavailable stand-in (R3); `freeze` is R5b.
 */
export type AdoptionPlan =
  | Readonly<{ kind: 'advance'; key: ToolBindingKey }>
  | Readonly<{ kind: 'keep'; key: ToolBindingKey }>
  | Readonly<{ kind: 'fallback'; key: ToolBindingKey }>
  | Readonly<{ kind: 'reload'; key: ToolBindingKey }>
  | Readonly<{ kind: 'replacement' }>
  | Readonly<{ kind: 'freeze'; verdict: FreezeVerdict }>

const REPLACEMENT: AdoptionPlan = Object.freeze({ kind: 'replacement' })

/** The adoption-point table of the SPEC, one row per combination of the three facts. */
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

/**
 * The last two rows of the table, after the coordinator reloaded the recorded key. A durable
 * failure freezes only when a different-shape winner exists; every temporary failure and every
 * withdrawn qualification gives the stand-in.
 */
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

/** The facts of a resident item when a provider changes during a Run. */
export type RefreshFacts = Readonly<{
  recorded: Readonly<{ key: ToolBindingKey; usable: boolean }>
  sameShape: readonly ToolBindingKey[]
}>

/**
 * The mid-Run rule: a provider change may change availability and routing only. The recorded key
 * does not move, nothing joins and nothing freezes. `routed` names the same-shape contribution the
 * next calls go to; `unavailable` is the R3 stand-in until the next adoption point.
 */
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

/** One resident tool as the session first admitted it (R4): its definition, shape and key. */
export type ResidentTool = Readonly<{
  definition: ToolDefinition
  shape: ToolShape
  key: ToolBindingKey
}>

export type ResidentFoldFailure =
  | Readonly<{ kind: 'already-resident'; name: string }>
  | Readonly<{ kind: 'shape-mismatch'; name: string }>

/**
 * Folds one admission into the resident set (R1): the set only grows, a capability joins once,
 * and the recorded shape is the shape of the recorded definition. The input array is not changed.
 */
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
