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
  SkillResolution,
} from '@omne-harness/skill-contract/provider'

/** One same-named candidate of one layer, with what Skill needs to read it. */
export type SkillCandidate = Candidate &
  Readonly<{
    locator: PackageLocator
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

type Found = Readonly<{ layer: SourceLayer; candidate: SkillCandidate }>

export function createSkillDecisions<P, S>(
  inputs: SkillDecisionInputs<P, S>,
): Readonly<{ resolution: SkillResolution<P, S>; readCheck: SkillReadCheck<P, S> }> {
  async function resolve(
    access: Access<P>,
    scope: S,
    capability: CapabilityId,
    basis?: SkillMaterialBasis,
  ): Promise<Resolution> {
    const layers = await inputs.layers(access, scope, capability)
    const candidates = new Map<Candidate, Found>()
    const verdicts = new Map<Candidate, Eligibility>()
    for (const layer of layers) {
      if (layer.state !== 'read') continue
      for (const candidate of layer.candidates) {
        candidates.set(candidate, { layer: layer.layer, candidate })
        verdicts.set(candidate, await inputs.eligible(access, scope, candidate, layer.layer))
      }
    }
    const result = evaluate({ layers, eligible: one => verdicts.get(one) ?? 'unknown' })
    if (result.kind === 'unavailable') return UNKNOWN
    if (result.kind === 'none') {
      // A disabled candidate that the principal may know stands in for the identity.
      const known = result.filtered.filter(out => out.reason === 'disabled')
      const told = known.map(out => verdicts.get(out.candidate))
      const shown = known.findLast(out => verdicts.get(out.candidate) === 'yes')
      const found = shown === undefined ? undefined : candidates.get(shown.candidate)
      if (found !== undefined) return standIn(capability, found.candidate.declared)
      return told.includes('unknown') ? UNKNOWN : NONE
    }
    const found = candidates.get(result.candidate)
    if (found === undefined) return UNKNOWN
    const { candidate } = found
    if (basis !== undefined) {
      const lawful =
        basis.layer === found.layer &&
        (basis.assetVersion === undefined || basis.assetVersion === candidate.version)
      if (!lawful) return BASIS_NOT_LAWFUL
    }
    const digest = basis?.digest ?? candidate.digest
    return {
      kind: 'adopted',
      ref: {
        capability,
        layer: found.layer,
        ...(isAssetVersion(candidate.version) ? { assetVersion: candidate.version } : {}),
        locator: candidate.locator,
        ...(digest === undefined ? {} : { digest }),
      },
      declared: candidate.declared,
    }
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
  const name = textOf(field(input.body, 'name'))
  const description = textOf(field(input.body, 'description'))
  const digest = textOf(field(field(input.body, 'package'), 'digest'))
  const tools = field(input.body, 'tools')
  if (!isSkillName(name) || !isPackageDigest(digest) || tools?.kind !== 'array') return undefined
  if (description !== undefined && !isSkillDescription(description)) return undefined
  const ids: CapabilityId[] = []
  for (const tool of tools.items) {
    const id = capabilityId(
      textOf(field(tool, 'category')) ?? '',
      textOf(field(tool, 'name')) ?? '',
    )
    if (!id.ok) return undefined
    ids.push(id.id)
  }
  return {
    asset: input.asset,
    version: input.version,
    disabled: input.disabled,
    immutable: input.immutable ?? false,
    replaceLocked: input.replaceLocked ?? false,
    locator: { kind: 'content-store', digest },
    digest,
    declared: { name, ...(description === undefined ? {} : { description }), tools: ids },
  }
}
