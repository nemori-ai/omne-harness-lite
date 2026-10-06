import { join, resolve } from 'node:path'
import { analyzeConformance } from '../arch/conformance.ts'
import { readArchitectureSource } from '../arch/source.ts'
import type { ActualExtraction } from '../arch/actual-model.ts'
import type { Conformance } from '../arch/conformance-model.ts'
import {
  object,
  older,
  parseMarker,
  type PackageScan,
  type TemplateManifest,
  type Variant,
} from './model.ts'
import { checkStructure, readObject } from './structure.ts'
import { readTemplate } from './template.ts'

export interface ScanEvidence {
  readonly actual: ActualExtraction
  readonly conformance: Conformance
}
function inferredVariant(
  member: string,
  manifest: Record<string, unknown>,
  actual: ActualExtraction,
): Variant {
  if (!object(manifest['exports']) || manifest['exports']['./cordis'] === undefined) return 'module'
  const facts = actual.facts.filter(fact => fact.member === member)
  if (facts.some(fact => fact.kind === 'defines' && fact.definitionForm === 'service-class'))
    return 'service-contract'
  if (facts.some(fact => fact.kind === 'provides')) return 'service-provider'
  return 'cordis-module'
}
export function inspectPackage(
  root: string,
  member: string,
  template: TemplateManifest,
  evidence: ScanEvidence,
): PackageScan {
  const manifest = readObject(join(root, member, 'package.json'))
  const namespace = manifest['omneHarness']
  const raw = object(namespace) ? namespace['packageTemplate'] : undefined
  const marker = parseMarker(raw)
  let adoption: PackageScan['adoption'] = 'unmarked'
  if (raw !== undefined || (namespace !== undefined && !object(namespace))) {
    adoption =
      marker === undefined
        ? 'invalid'
        : marker.id !== template.id
          ? 'unknown'
          : marker.version === template.version
            ? 'current'
            : older(marker.version, template.version)
              ? 'older'
              : 'unknown'
  }
  const inferred = inferredVariant(member, manifest, evidence.actual)
  const selected = marker?.variant ?? inferred
  const previous = marker === undefined ? undefined : template.previousVersions[marker.version]
  const supported =
    adoption === 'unmarked' ||
    adoption === 'current' ||
    (adoption === 'older' && previous !== undefined)
  const required = previous?.requiredFiles ?? template.requiredFiles
  const findings = checkStructure(root, member, manifest, selected, required)
  if (selected !== inferred)
    findings.push({
      code: 'variant',
      path: `${member}/package.json`,
      reason: `Declared ${selected}; observed ${inferred}. Review the binding ownership`,
    })
  if (adoption === 'invalid')
    findings.push({
      code: 'marker',
      path: `${member}/package.json`,
      reason: 'Invalid template marker; require exactly id/version/variant',
    })
  if (!supported)
    findings.push({
      code: 'unsupported-version',
      path: `${member}/package.json`,
      reason:
        'No exact structural rules for the declared identity/version; current rules cannot certify it',
    })
  for (const row of evidence.conformance.rows) {
    if (row.member !== member || row.state !== 'deviation') continue
    findings.push({ code: row.rule, path: row.sites[0]?.path ?? member, reason: row.reason })
  }
  // Dynamic keys and generic helpers are not necessarily violations of the file template.
  // Keep them visible without claiming that a template marker verifies their semantics.
  const bindingUnknowns = [...evidence.actual.unknown, ...evidence.actual.importUnknown]
    .filter(item => item.member === member)
    .map(item => ({ path: item.path, reason: item.reason }))
  const structure = !supported ? 'uncovered' : findings.length === 0 ? 'pass' : 'fail'
  return {
    path: member,
    name: String(manifest['name']),
    adoption,
    ...(marker === undefined ? {} : { marker }),
    variant: selected,
    structure,
    findings,
    architectureUnknowns: evidence.conformance.rows.filter(
      row => row.member === member && row.state === 'unknown',
    ).length,
    bindingUnknowns,
  }
}
/** Uses the existing workspace/source resolver and conformance facts; no second extractor. */
export function scanPackages(root: string, members?: readonly string[]): PackageScan[] {
  root = resolve(root)
  const source = readArchitectureSource(root)
  const analysis = analyzeConformance(root, source)
  const template = readTemplate()
  const products = source.members.filter(member => /^packages\/[^/]+\/[^/]+$/u.test(member.path))
  if (members !== undefined)
    for (const member of members) {
      if (!products.some(item => item.path === member))
        throw new Error(`Unknown product member: ${member}`)
    }
  return products
    .filter(member => members === undefined || members.includes(member.path))
    .map(member =>
      inspectPackage(root, member.path, template, {
        actual: analysis.headActual,
        conformance: analysis.conformance,
      }),
    )
}
export function scanExitCode(results: readonly PackageScan[], check: boolean): number {
  if (!check) return 0 // inventory is not an assertion; every state is still reported
  if (results.some(item => item.structure === 'uncovered')) return 2
  return results.some(item => item.adoption !== 'current' || item.structure !== 'pass') ? 1 : 0
}
