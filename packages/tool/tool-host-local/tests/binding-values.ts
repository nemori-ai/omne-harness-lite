// Builders for the binding registry and Catalog tests. Everything here is a test double and stays
// in tests: the origin check is scripted (the package ships none), and loaded registrations come
// from the contract suite's fixture, which is the only place that builds the branded handle.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import type { Access, SourceLayer, ToolDefinition } from '@omne-harness/tool-contract'
import {
  sameSourceLayer,
  type ToolAuthority,
  type ToolLoadedRegistration,
} from '@omne-harness/tool-contract/provider'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { memoryToolBindingRegistryFixture } from '@omne-harness/tool-cordis-contract/testing'
import {
  createLocalToolBindingRegistry,
  type LocalToolBindingRegistry,
  type LocalToolContributionVerifier,
} from '@omne-harness/tool-host-local'

export const tenantA = testingTenant(`org_${'a'.repeat(26)}`, `acc_${'1'.repeat(26)}`)
export const tenantA2 = testingTenant(`org_${'a'.repeat(26)}`, `acc_${'2'.repeat(26)}`)
export const tenantB = testingTenant(`org_${'b'.repeat(26)}`, `acc_${'3'.repeat(26)}`)

export const accessOf = (tenant: Access<string>['tenant'], principal = 'user'): Access<string> => ({
  principal,
  tenant,
})

const base = memoryToolBindingRegistryFixture()

export function authorityFor(
  layer: SourceLayer,
  name: string,
  holding = `holding-${name}`,
  revision = '1',
): ToolAuthority {
  const evidence = (record: string) => ({
    owner: 'test',
    record,
    revision: '1',
    digest: `sha256:${record}`,
  })
  return {
    layer,
    asset: {
      name,
      adoption: { owner: 'test', name, revision, digest: `sha256:${name}-${revision}` },
    },
    holding: evidence(holding),
    publication: evidence(`${holding}-publication`),
  }
}

/** A loaded registration for the authority's key; `programmable` is the only definition knob. */
export function loadedFor(
  authority: ToolAuthority,
  digest = 'digest-1',
  options: Readonly<{ programmable?: boolean }> = {},
): ToolLoadedRegistration<unknown, ContentBlock> {
  const loaded = base.loaded(authority, digest)
  const definition: ToolDefinition = {
    ...loaded.definition,
    ...(options.programmable === undefined ? {} : { programmable: options.programmable }),
  }
  // The brand has no run-time value, so a copy with another definition is a loaded registration.
  return { ...loaded, definition } as unknown as ToolLoadedRegistration<unknown, ContentBlock>
}

/** The scripted origin check: it grants the holdings in `granted` at the layer they name. */
export function scriptedVerifier(
  granted: readonly ToolAuthority[],
): LocalToolContributionVerifier<string> {
  return {
    verify: authority => {
      const grant = granted.find(candidate => candidate.holding.record === authority.holding.record)
      if (grant === undefined) return fail({ kind: 'denied' })
      if (!sameSourceLayer(grant.layer, authority.layer))
        return fail({ kind: 'invalid', reason: 'layer' })
      return succeed(grant)
    },
    admits: (access, layer) => {
      const admitted =
        layer.kind === 'official' ||
        (layer.kind === 'organization' &&
          layer.organization.text === access.tenant.organization.text) ||
        (layer.kind === 'tenant' &&
          sameSourceLayer(layer, { kind: 'tenant', tenant: access.tenant }))
      return admitted ? succeed(undefined) : fail({ kind: 'denied' })
    },
  }
}

/** A registry whose caller fiber is the one that `asFiber` names. */
export function fiberedRegistry(verifier: LocalToolContributionVerifier<string> | null): Readonly<{
  registry: LocalToolBindingRegistry<string, unknown, ContentBlock>
  asFiber<T>(fiber: string, work: () => T): T
}> {
  const fibers = new AsyncLocalStorage<string>()
  const registry = createLocalToolBindingRegistry<string, unknown, ContentBlock>({
    verifier,
    fiber: () => fibers.getStore() ?? 'ambient',
  })
  return { registry, asFiber: (fiber, work) => fibers.run(fiber, work) }
}

export function register(
  registry: LocalToolBindingRegistry<string, unknown, ContentBlock>,
  access: Access<string>,
  authority: ToolAuthority,
  digest = 'digest-1',
  options: Readonly<{ programmable?: boolean }> = {},
) {
  return registry.register({
    ...access,
    loaded: loadedFor(authority, digest, options),
    authority,
  })
}

export const officialLayer: SourceLayer = { kind: 'official' }
export const tenantLayer = (tenant: Access<string>['tenant']): SourceLayer => ({
  kind: 'tenant',
  tenant,
})
export const organizationLayer = (tenant: Access<string>['tenant']): SourceLayer => ({
  kind: 'organization',
  organization: tenant.organization,
})
