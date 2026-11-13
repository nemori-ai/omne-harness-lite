// The two judging ports of Skill, bound to the candidate resolution of assets. `resolve` takes
// the same-named candidates of every layer from a function that the assembly gives (for example
// the official candidates and the tenant's held capability), asks `evaluate` of assets, and
// translates its answer into the five answers of `Resolution`. `check` passes the question on
// to a function that the assembly gives. Who may use a capability is an input of the assembly:
// this member defines no general port for it.
import {
  capabilityId,
  evaluate,
  type CapabilityId,
  type Candidate,
  type Evaluation,
  type Filtered,
  type JsonValue,
} from '@omne-harness/assets'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  isAssetVersion,
  isPackageDigest,
  isSafeReason,
  isSkillDescription,
  isSkillName,
  type DeclaredProjection,
  type PackageDigest,
  type SafeReason,
  type SkillMaterialBasis,
  type SourceLayer,
} from '@omne-harness/skill-contract'
import type {
  CatalogResolution,
  PackageLocator,
  ReadVerdict,
  Resolution,
  SkillReadCheck,
  SkillRef,
  SkillResolution,
} from '@omne-harness/skill-contract/provider'

/** Where a candidate's package is. A content-store locator gets its `ref` from the binding: the
 * asset reference of the candidate. */
export type CandidateLocator =
  | Readonly<{ kind: 'directory'; root: string }>
  | Readonly<{ kind: 'content-store'; digest: PackageDigest }>

/** One same-named candidate of one layer, with what Skill needs to read it. */
export type SkillCandidate = Candidate &
  Readonly<{
    locator: CandidateLocator
    /** The package digest; absent when the body names no package. */
    digest?: PackageDigest
    declared: DeclaredProjection
  }>

export type SkillLayerInput =
  | Readonly<{ layer: SourceLayer; state: 'not-applicable' | 'unavailable' }>
  | Readonly<{ layer: SourceLayer; state: 'read'; candidates: readonly SkillCandidate[] }>

export type Eligibility = 'yes' | 'no' | 'unknown'

/** The inputs of the assembly. A throw of any of them counts as `unknown`. */
export type SkillDecisionInputs<P, S> = Readonly<{
  /** The layers of one identity, from the widest to the most specific. */
  layers(access: Access<P>, scope: S, capability: CapabilityId): Promise<readonly SkillLayerInput[]>
  /** Whether the principal may use this candidate; also whether it may know a disabled one. */
  eligible(
    access: Access<P>,
    scope: S,
    candidate: SkillCandidate,
    layer: SourceLayer,
  ): Promise<Eligibility>
  /** The identities whose layers `adopted` resolves. */
  identities(access: Access<P>, scope: S): Promise<Outcome<readonly CapabilityId[], 'unknown'>>
  /** The read check. */
  readable(access: Access<P>, scope: S, capability: CapabilityId): Promise<ReadVerdict>
}>

const UNKNOWN = Object.freeze({ kind: 'unknown' } as const)
const NONE = Object.freeze({ kind: 'none' } as const)
const BASIS_NOT_LAWFUL = Object.freeze({ kind: 'basis-not-lawful' } as const)
const DISABLED: SafeReason = (() => {
  const reason = 'This Skill is disabled.'
  if (!isSafeReason(reason)) throw new Error('unreachable: the reason is a safe reason')
  return reason
})()

/** One candidate with its layer and the eligibility that the assembly answered for it. */
type Judged = Readonly<{ layer: SourceLayer; candidate: SkillCandidate; verdict: Eligibility }>

export function createSkillDecisions<P, S>(
  inputs: SkillDecisionInputs<P, S>,
): Readonly<{ resolution: SkillResolution<P, S>; readCheck: SkillReadCheck<P, S> }> {
  /** Asks the assembly for the eligibility of every candidate of every layer that was read. */
  async function judge(
    access: Access<P>,
    scope: S,
    layers: readonly SkillLayerInput[],
  ): Promise<ReadonlyMap<Candidate, Judged>> {
    const judged = new Map<Candidate, Judged>()
    for (const layer of layers) {
      if (layer.state !== 'read') continue
      for (const candidate of layer.candidates) {
        const verdict = await inputs.eligible(access, scope, candidate, layer.layer)
        judged.set(candidate, { layer: layer.layer, candidate, verdict })
      }
    }
    return judged
  }

  async function resolve(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    basis?: SkillMaterialBasis,
  ): Promise<Resolution> {
    const layers = await inputs.layers(access, scope, capability)
    const judged = await judge(access, scope, layers)
    const result = evaluate({ layers, eligible: one => judged.get(one)?.verdict ?? 'unknown' })
    return translate(capability, result, judged, basis)
  }
  const resolution: SkillResolution<P, S> = {
    async resolve(access, scope, capability, options) {
      try {
        return await resolve(access, scope, capability, options?.basis)
      } catch {
        return UNKNOWN
      }
    },
    async adopted(access, scope) {
      try {
        const identities = await inputs.identities(access, scope)
        if (!('ok' in identities)) return fail('unknown')
        const set: CatalogResolution[] = []
        for (const capability of identities.ok) {
          const answer = await resolve(access, scope, capability)
          if (answer.kind === 'unknown') return fail('unknown')
          if (answer.kind === 'adopted' || answer.kind === 'known-unavailable') set.push(answer)
        }
        return succeed(set)
      } catch {
        return fail('unknown')
      }
    },
  }

  const readCheck: SkillReadCheck<P, S> = {
    async check(access, scope, capability) {
      try {
        return await inputs.readable(access, scope, capability)
      } catch {
        return UNKNOWN
      }
    },
  }

  return Object.freeze({ resolution, readCheck })
}

/** The answer of `evaluate` as one of the five answers of `Resolution`. */
function translate(
  capability: CapabilityId,
  result: Evaluation,
  judged: ReadonlyMap<Candidate, Judged>,
  basis: SkillMaterialBasis | undefined,
): Resolution {
  switch (result.kind) {
    case 'unavailable':
      return UNKNOWN
    case 'none':
      return noWinner(capability, result.filtered, judged)
    case 'winner': {
      const winner = judged.get(result.candidate)
      if (winner === undefined) throw new Error('unreachable: the winner is a judged candidate')
      if (basis !== undefined && !isLawfulBasis(basis, winner)) return BASIS_NOT_LAWFUL
      return {
        kind: 'adopted',
        ref: refOf(capability, winner, basis),
        declared: winner.candidate.declared,
      }
    }
  }
}

/** Without a winner: a disabled candidate that the principal may know stands in for the
 * identity; one whose eligibility is unknown makes the answer unknown; otherwise none. */
function noWinner(
  capability: CapabilityId,
  filtered: readonly Filtered[],
  judged: ReadonlyMap<Candidate, Judged>,
): Resolution {
  const disabled = filtered.flatMap(out => {
    const one = out.reason === 'disabled' ? judged.get(out.candidate) : undefined
    return one === undefined ? [] : [one]
  })
  const shown = disabled.findLast(one => one.verdict === 'yes')
  if (shown !== undefined) return standIn(capability, shown.candidate.declared)
  return disabled.some(one => one.verdict === 'unknown') ? UNKNOWN : NONE
}

/** A basis is lawful when it names the winner's layer and, if it has one, the winner's version. */
function isLawfulBasis(basis: SkillMaterialBasis, winner: Judged): boolean {
  return (
    basis.layer === winner.layer &&
    (basis.assetVersion === undefined || basis.assetVersion === winner.candidate.version)
  )
}

/** The internal reference of the winner; with a basis it carries the basis digest. */
function refOf(capability: CapabilityId, winner: Judged, basis?: SkillMaterialBasis): SkillRef {
  const { candidate } = winner
  const digest = basis?.digest ?? candidate.digest
  return {
    capability,
    layer: winner.layer,
    ...(isAssetVersion(candidate.version) ? { assetVersion: candidate.version } : {}),
    locator: locatorOf(candidate),
    ...(digest === undefined ? {} : { digest }),
  }
}

/** The locator of the reference: a content-store locator carries the candidate's asset reference
 * as the opaque `ref`, which the content store gets back. */
function locatorOf(candidate: SkillCandidate): PackageLocator {
  return candidate.locator.kind === 'content-store'
    ? { kind: 'content-store', digest: candidate.locator.digest, ref: candidate.asset }
    : candidate.locator
}

function standIn(capability: CapabilityId, declared: DeclaredProjection): Resolution {
  return {
    kind: 'known-unavailable',
    capability,
    reason: DISABLED,
    name: declared.name,
    ...(declared.description === undefined ? {} : { description: declared.description }),
  }
}

function field(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object'
    ? value.entries.find(entry => entry.key === key)?.value
    : undefined
}

function textOf(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

/** The tool identities of the body's `tools`, or `undefined` when one item is not one. */
function toolsOf(tools: JsonValue | undefined): CapabilityId[] | undefined {
  if (tools?.kind !== 'array') return undefined
  const ids: CapabilityId[] = []
  for (const tool of tools.items) {
    const id = capabilityId(
      textOf(field(tool, 'category')) ?? '',
      textOf(field(tool, 'name')) ?? '',
    )
    if (!id.ok) return undefined
    ids.push(id.id)
  }
  return ids
}

/** The declared projection of a body: name, description and tools. */
function declaredOf(body: JsonValue): DeclaredProjection | undefined {
  const name = textOf(field(body, 'name'))
  const description = textOf(field(body, 'description'))
  const tools = toolsOf(field(body, 'tools'))
  if (!isSkillName(name) || tools === undefined) return undefined
  if (description === undefined) return { name, tools }
  return isSkillDescription(description) ? { name, description, tools } : undefined
}

/**
 * The candidate of a published Skill from the body of its version record: the declared name,
 * description and tools, and the package digest as a content-store locator. `undefined` when the
 * body is not the body of a published Skill package.
 */
export function publishedCandidate(
  input: Readonly<{
    asset: string
    version: string
    body: JsonValue
    disabled: boolean
    immutable?: boolean
    replaceLocked?: boolean
  }>,
): SkillCandidate | undefined {
  const declared = declaredOf(input.body)
  const digest = textOf(field(field(input.body, 'package'), 'digest'))
  if (declared === undefined || !isPackageDigest(digest)) return undefined
  return {
    asset: input.asset,
    version: input.version,
    disabled: input.disabled,
    immutable: input.immutable ?? false,
    replaceLocked: input.replaceLocked ?? false,
    locator: { kind: 'content-store', digest },
    digest,
    declared,
  }
}
