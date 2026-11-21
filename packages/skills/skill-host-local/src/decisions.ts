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

export type CandidateLocator =
  | Readonly<{ kind: 'directory'; root: string }>
  | Readonly<{ kind: 'content-store'; digest: PackageDigest }>

export type SkillCandidate = Candidate &
  Readonly<{
    locator: CandidateLocator
    digest?: PackageDigest
    declared: DeclaredProjection
  }>

export type SkillLayerInput =
  | Readonly<{ layer: SourceLayer; state: 'not-applicable' | 'unavailable' }>
  | Readonly<{ layer: SourceLayer; state: 'read'; candidates: readonly SkillCandidate[] }>

export type Eligibility = 'yes' | 'no' | 'unknown'

export type SkillDecisionInputs<P, S> = Readonly<{
  layers(access: Access<P>, scope: S, capability: CapabilityId): Promise<readonly SkillLayerInput[]>
  eligible(
    access: Access<P>,
    scope: S,
    candidate: SkillCandidate,
    layer: SourceLayer,
  ): Promise<Eligibility>
  identities(access: Access<P>, scope: S): Promise<Outcome<readonly CapabilityId[], 'unknown'>>
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

type Judged = Readonly<{ layer: SourceLayer; candidate: SkillCandidate; verdict: Eligibility }>

export function createSkillDecisions<P, S>(
  inputs: SkillDecisionInputs<P, S>,
): Readonly<{ resolution: SkillResolution<P, S>; readCheck: SkillReadCheck<P, S> }> {
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

function isLawfulBasis(basis: SkillMaterialBasis, winner: Judged): boolean {
  return (
    basis.layer === winner.layer &&
    (basis.assetVersion === undefined || basis.assetVersion === winner.candidate.version)
  )
}

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

function declaredOf(body: JsonValue): DeclaredProjection | undefined {
  const name = textOf(field(body, 'name'))
  const description = textOf(field(body, 'description'))
  const tools = toolsOf(field(body, 'tools'))
  if (!isSkillName(name) || tools === undefined) return undefined
  if (description === undefined) return { name, tools }
  return isSkillDescription(description) ? { name, description, tools } : undefined
}

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
