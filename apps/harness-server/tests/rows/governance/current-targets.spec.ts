import { beforeAll, expect, it } from 'vitest'
import { canonicalDigest } from '@omne-harness/tool'
import {
  currentGovernanceTargets,
  currentGovernanceCatalog,
} from '../../../src/rows/governance/current-targets.ts'
import { toolAssetPublication } from '../../../src/rows/governance/tool-assets.ts'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'

type Input = Parameters<typeof currentGovernanceTargets>[0]
let baseline: Input
beforeAll(async () => {
  const release = await loadProductionRelease()
  if (release.kind !== 'trusted') throw new Error(JSON.stringify(release))
  const entry = release.manifest.entries.find(value => value.asset.name === 'Shell')
  const definition = entry?.governance.declaration.settings[0]
  if (entry === undefined || definition === undefined) throw new Error('Shell declaration absent')
  const target = { policyId: 'asset', scopeRef: 'tenant-a', targetRef: 'shell' }
  const capture: Input['capture'] = {
    domain: { scope: { kind: 'tenant', tenant: 'tenant-a' }, transactionDomain: 'governance' },
    principalRef: 'alice',
    captureId: 'capture',
    request: { deploymentRef: 'test', mode: 'runtime', targets: [target], selectionRef: null },
  }
  const definitionRef = {
    providerId: definition.providerId,
    definitionId: definition.definitionId,
    version: definition.version,
    digest: canonicalDigest(definition).slice(7),
  }
  baseline = {
    capture,
    assets: {
      binding: capture,
      views: [
        {
          target,
          definition,
          definitionRef,
          enabled: true,
          ownerRevision: 1,
          sources: [
            {
              sourceId: 'tenant',
              ownerRef: 'settings',
              scope: { kind: 'tenant', subjectRef: 'tenant-a' },
              authorityRevision: '1',
            },
          ],
          grants: [],
        },
      ],
    },
    assetPublications: {
      binding: capture,
      views: [
        {
          target,
          definitionRef,
          ownerRevision: 1,
          publicationRef: toolAssetPublication(entry).publicationRef,
        },
      ],
    },
    standalone: { binding: capture, views: [] },
    standalonePublications: { binding: capture, views: [] },
    released: [
      {
        publication: { kind: 'asset', reference: toolAssetPublication(entry).publicationRef },
        declaration: entry.governance.declaration,
      },
    ],
  }
})

it('matches the exact published definition and origin', () => {
  expect(currentGovernanceTargets(baseline)).toMatchObject([
    {
      target: baseline.capture.request.targets[0],
      origin: baseline.released[0]?.declaration.origin,
      definition: baseline.assets.views[0]?.definition,
    },
  ])
})

const mutations: [string, (input: Input) => void][] = [
  [
    'another capture',
    input => {
      input.assets.binding = { ...input.capture, captureId: 'other' }
    },
  ],
  [
    'another publication revision',
    input => {
      const view = input.assetPublications.views[0]
      if (view) view.ownerRevision++
    },
  ],
  [
    'another definition digest',
    input => {
      const view = input.assets.views[0]
      if (view) view.definitionRef = { ...view.definitionRef, digest: '0'.repeat(64) }
    },
  ],
  [
    'a different definition body',
    input => {
      const view = input.assets.views[0]
      if (view) view.definition = { ...view.definition, groups: [] }
    },
  ],
  [
    'same Settings but another publication',
    input => {
      const view = input.assetPublications.views[0]
      if (view) view.publicationRef.source = 'substitute'
    },
  ],
  [
    'disabled target',
    input => {
      const view = input.assets.views[0]
      if (view) view.enabled = false
    },
  ],
  [
    'missing target',
    input => {
      input.assets.views = []
    },
  ],
  [
    'duplicate target view',
    input => {
      input.assets.views.push(...input.assets.views)
    },
  ],
  [
    'duplicate publication view',
    input => {
      input.assetPublications.views.push(...input.assetPublications.views)
    },
  ],
  [
    'duplicate requested target',
    input => {
      input.capture.request.targets.push(...input.capture.request.targets)
    },
  ],
  [
    'missing issuer',
    input => {
      input.released = []
    },
  ],
  [
    'ambiguous issuer',
    input => {
      input.released = [...input.released, ...input.released]
    },
  ],
  [
    'unsupported target owner',
    input => {
      const target = input.capture.request.targets[0]
      if (target) target.policyId = 'unknown'
    },
  ],
]
it.each(mutations)(
  'refuses %s instead of presenting complete current evidence',
  (_name, mutate) => {
    const input = structuredClone(baseline)
    mutate(input)
    expect(currentGovernanceTargets(input)).toBeUndefined()
  },
)

function managementInput(): Input {
  const input = structuredClone(baseline)
  input.capture.request.mode = 'management'
  input.capture.request.targets = []
  for (const source of [
    input.assets,
    input.assetPublications,
    input.standalone,
    input.standalonePublications,
  ])
    source.binding = input.capture
  return input
}

it('keeps disabled current targets visible to management without treating them as enabled', () => {
  const input = managementInput()
  input.assets.views[0]!.enabled = false
  expect(currentGovernanceCatalog(input)).toMatchObject({
    targets: [{ target: input.assets.views[0]!.target, enabled: false }],
    unavailableOwners: [],
  })
})

it('reports an unknown immutable publication as partial rather than a complete empty catalog', () => {
  const input = managementInput()
  input.released = []
  expect(currentGovernanceCatalog(input)).toEqual({
    targets: [],
    unavailableOwners: ['harness.governance-publications'],
  })
})

it('names the known owner when the current publication no longer matches its release', () => {
  const input = managementInput()
  input.assetPublications.views[0]!.publicationRef.version = 'unrecognized-release'
  expect(currentGovernanceCatalog(input)).toEqual({
    targets: [],
    unavailableOwners: [input.released[0]!.declaration.reference.ownerId],
  })
})

it.each(['capture', 'duplicate', 'missing-publication'] as const)(
  'refuses inconsistent catalog facts: %s',
  mutation => {
    const input = managementInput()
    if (mutation === 'capture')
      input.assets.binding = { ...input.capture, captureId: 'another-request' }
    if (mutation === 'duplicate') input.assets.views.push(input.assets.views[0]!)
    if (mutation === 'missing-publication') input.assetPublications.views = []
    expect(currentGovernanceCatalog(input)).toBeUndefined()
  },
)
