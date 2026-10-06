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
import { checkLayout } from './layout.ts'
import { discoverProducts } from './discovery.ts'

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
  const rules = previous ?? template
  const required = [...rules.requiredFiles, ...rules.variantRequiredFiles[selected]]
  const layout = checkLayout(root, member, previous?.layout ?? template.layout)
  const findings = [
    ...layout.findings,
    ...checkStructure(root, member, manifest, selected, required),
  ]
  // A private helper's Service/provide fact does not decide public responsibility.
  // Unmarked inference is an inventory hint; adopted variants require manual review.
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
  const structure = !supported ? 'uncovered' : findings.length === 0 ? 'pass' : 'fail'
  const deviations = evidence.conformance.rows.filter(
    row => row.member === member && row.state === 'deviation',
  )
  for (const row of deviations) {
    if (row.member !== member || row.state !== 'deviation') continue
    findings.push({ code: row.rule, path: row.sites[0]?.path ?? member, reason: row.reason })
  }
  // Dynamic keys and generic helpers are not necessarily violations of the file template.
  // Keep them visible without claiming that a template marker verifies their semantics.
  const bindingUnknowns = [...evidence.actual.unknown, ...evidence.actual.importUnknown]
    .filter(item => item.member === member)
    .map(item => ({ path: item.path, reason: item.reason }))
  const architectureUnknowns = evidence.conformance.rows.filter(
    row => row.member === member && row.state === 'unknown',
  ).length
  return {
    path: member,
    name: String(manifest['name']),
    adoption,
    ...(marker === undefined ? {} : { marker }),
    variant: selected,
    structure,
    tree: layout.tree,
    excludedDirectories: layout.excludedDirectories,
    integration:
      deviations.length > 0
        ? 'deviation'
        : architectureUnknowns > 0 || bindingUnknowns.length > 0
          ? 'unknown'
          : 'static-pass',
    findings,
    architectureUnknowns,
    bindingUnknowns,
  }
}
/** Uses the existing workspace/source resolver and conformance facts; no second extractor. */
export function scanPackages(root: string, members?: readonly string[]): PackageScan[] {
  root = resolve(root)
  const candidates = discoverProducts(root)
  const source = readArchitectureSource(root)
  const analysis = analyzeConformance(root, source)
  const template = readTemplate()
  const products = source.members.filter(member => /^packages\/[^/]+\/[^/]+$/u.test(member.path))
  if (
    candidates.join('\n') !==
    products
      .map(member => member.path)
      .sort()
      .join('\n')
  )
    throw new Error('Product discovery and source inventory disagree: scan is uncovered')
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
  // This command asserts the full template tree, not a full integration acceptance.
  // Unknown integration facts remain visible and require manual adoption review.
  return results.some(
    item =>
      item.adoption !== 'current' || item.structure !== 'pass' || item.integration === 'deviation',
  )
    ? 1
    : 0
}
