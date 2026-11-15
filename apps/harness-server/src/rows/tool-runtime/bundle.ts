import { defaultResultPolicy } from '@omne-harness/tool-contract/provider'
import { TOOL_READ_ARGUMENTS } from '../../entry/tool-read-budget.ts'
import { releaseCatalogViewOf } from '../tool-bindings/catalog-view.ts'
import type { Context } from '@deepseek-ai/cordis'
import { createRecoveryAccess } from '@omne-harness/execution-environment-contract'
import { canonicalDigest } from '@omne-harness/tool'
import {
  toolBindingsKey,
  toolCatalogKey,
  toolStartAuthorityKey,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  createLocalInvocationSource,
  createLocalInvocationQualifier,
  type LocalInvocationSourceInput,
} from '@omne-harness/tool-host-local'
import {
  createLocalToolRuntimePlugins,
  type LocalToolRuntimeInput,
} from '@omne-harness/tool-host-local/cordis'
import { admitMaintainer } from '../../entry/execution-authorities.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { isReleaseToolsRequest } from '../../entry/tool-forward-requests.ts'
import { toolTargetPolicyOf } from '../authorization/tool-target-policy.ts'
import {
  admittedTargetAccess,
  currentTargetPolicy,
  withTargetAdmissionPolicy,
} from './target-policy.ts'
import { createReleaseToolIdentity, releasePrincipalCodec } from './access.ts'
import type { ToolRuntimeConfig } from './config.ts'
import { createReleaseEnvironment } from './environment.ts'
import {
  lateBodyStore,
  lateConditional,
  lateStore,
  toolRuntimeHolder,
  type ToolRuntimeBundle,
  type ToolRuntimeHolder,
} from './holder.ts'
import { runScopeGrants } from './scope.ts'
import { toolHitlHolder } from '../tool-hitl/holder.ts'

const OWNER = '@omne-harness/harness-server'

function releasePermitRequirements(
  root: Context,
  identity: ReturnType<typeof createReleaseToolIdentity>,
): LocalToolRuntimeInput['permitRequirements'] {
  return {
    async check(input) {
      const release = releaseOf(root)
      if (release.kind !== 'trusted')
        return { kind: 'unavailable', diagnostic: 'release snapshot unavailable' }
      const availability = input.request.availability
      const name = availability.definition.name
      const inRelease =
        availability.kind === 'available' &&
        availability.layer.kind === 'official' &&
        release.manifest.entries.some(entry => entry.asset.name === name)
      if (!inRelease) return { kind: 'unavailable', diagnostic: 'not a release built-in tool' }
      const work = await identity.sessionWork(input.principal, input.tenant)
      if (work.kind === 'unavailable')
        return {
          kind: 'unavailable',
          diagnostic: `the session work principal could not be verified: ${work.diagnostic}`,
        }
      if (work.kind !== 'session')
        return { kind: 'unavailable', diagnostic: 'not a session work principal of the tenant' }
      return {
        kind: 'not-required',
        source: {
          owner: OWNER,
          record: `release-tool-permit:${input.call}`,
          revision: release.generation,
          digest: canonicalDigest({ call: input.call, request: input.request }),
        },
      }
    },
  }
}

export type ToolLostContact = NonNullable<LocalToolRuntimeInput['lostContact']>

function inputFor(
  root: Context,
  holder: ToolRuntimeHolder,
  config: ToolRuntimeConfig,
  lostContact: ToolLostContact | undefined,
) {
  const identity = createReleaseToolIdentity(holder)
  const store = lateStore(holder)
  const requestAccess = currentTargetPolicy({
    authorization: () => toolTargetPolicyOf(root),
    view: () => releaseCatalogViewOf(root),
  })
  const sourceInput: LocalInvocationSourceInput<unknown> = {
    store,
    authority: identity.sourceAuthority,
    principalCodec: releasePrincipalCodec,
    commitAttempts: config.configuration.ledgerCommitAttempts,
    forwarding: {
      authority: () => root.get(toolStartAuthorityKey, false),
      isParent: request => isReleaseToolsRequest(releaseOf(root), request),
      results: {
        access: identity.access.guard,
        policy: defaultResultPolicy,
        pageBytes: config.configuration.resultPageBytes,
      },
    },
  }
  const sources = createLocalInvocationSource(sourceInput)
  const recoveryAccess = createRecoveryAccess()
  admitMaintainer(root, recoveryAccess)
  const environment = createReleaseEnvironment(holder, identity, {
    filesRoot: config.filesRoot,
    commitAttempts: config.configuration.ledgerCommitAttempts,
    schemaProvider: () => holder.schemaProvider,
    warn: text => root.logger('tool-runtime').warn(text),
  })
  const input: LocalToolRuntimeInput = {
    store,
    bodySchemas: {
      check: (schema, read) =>
        holder.bodySchemas?.check(schema, read) ??
        Promise.resolve({
          failure: {
            kind: 'unavailable',
            dependency: 'body-schema',
            diagnostic: 'tool-records body schema provider is not mounted',
          },
        }),
    },
    bodies: {
      store: lateBodyStore(holder),
      permitKey: holder.bodyPermitKey,
      clock: holder.bodyClock,
    },
    conditionalCommit: lateConditional(holder),
    content: null,
    sources: { ...sources, guard: withTargetAdmissionPolicy(sources.guard, store, requestAccess) },
    access: { ...identity.access, request: admittedTargetAccess(store, requestAccess) },
    subjects: identity.subjects,
    grants: runScopeGrants(),
    guardsOf: () => [],
    permitRequirements: releasePermitRequirements(root, identity),
    clock: holder.clock,
    configuration: { ...config.configuration, readResultArguments: TOOL_READ_ARGUMENTS },
    bindings: () => root.get(toolBindingsKey) as ReturnType<LocalToolRuntimeInput['bindings']>,
    catalog: () => root.get(toolCatalogKey),
    decisions: () => toolHitlHolder(root).bridge ?? undefined,
    environment: environment.input,
    capacity: config.capacity,
    observersPerCall: config.observersPerCall,
    observerQueueFrames: config.observerQueueFrames,
    observerResidenceMs: config.observerResidenceMs,
    recoveryAccess,
    ...(lostContact === undefined ? {} : { lostContact }),
  }
  return { input, qualification: createLocalInvocationQualifier(sourceInput) }
}

export function ensureToolRuntimeBundle(
  ctx: Context,
  config: ToolRuntimeConfig,
  lostContact?: ToolLostContact,
): ToolRuntimeBundle {
  const holder = toolRuntimeHolder(ctx)
  const digest = canonicalDigest(config)
  if (holder.bundle !== null) {
    if (holder.bundle.configDigest !== digest)
      throw new Error('tool runtime: this run already built its bundle with another configuration')
    return holder.bundle.value
  }
  const { input, qualification } = inputFor(ctx.root, holder, config, lostContact)
  const value = Object.freeze({ ...createLocalToolRuntimePlugins(input), qualification })
  holder.bundle = Object.freeze({ value, configDigest: digest })
  holder.resolve(value)
  return value
}
