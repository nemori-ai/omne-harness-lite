import { releaseCatalogViewOf } from '../tool-bindings/catalog-view.ts'
// 建 Tool 运行时组的唯一 bundle（B 段，R2-D66 第 3 项，L-TOOL 事实清单 §3）：`createLocalToolRuntimePlugins` 的
// 每个输入只取已核来源，缺席时由各自的窄代理答 `unavailable`。`tool-records` 行按运维者配置调用一次；同一运行的
// 后续调用配置必须相同，否则装载失败（不建第二份 bundle，也不悄悄沿用旧配置）。
import type { Context } from '@deepseek-ai/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import {
  toolBindingsKey,
  toolCatalogKey,
  toolStartAuthorityKey,
} from '@omne-harness/tool-cordis-contract/cordis'
import {
  createLocalGrantVerifiers,
  createLocalInvocationSource,
  createLocalInvocationQualifier,
  type LocalInvocationSourceInput,
} from '@omne-harness/tool-host-local'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import {
  createLocalToolRuntimePlugins,
  type LocalToolRuntimeInput,
} from '@omne-harness/tool-host-local/cordis'
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
  lateCustody,
  lateStore,
  toolRuntimeHolder,
  type ToolRuntimeBundle,
  type ToolRuntimeHolder,
} from './holder.ts'
import { RELEASE_TOOL_SCOPE } from './scope.ts'

const OWNER = '@omne-harness/harness-server'

/**
 * 启动许可需求（`permitRequirements`）：发行内置的官方 Shell、Files，调用方是本租户的会话工作主体时不需要另取许可，
 * 证据指名这次启动；其余答 unavailable，启动不进行。动作本身的准入归 `authorization` 行的动作规则。
 */
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
      const session = await identity.sessionOf(input.principal, input.tenant)
      if (session === undefined)
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

function inputFor(root: Context, holder: ToolRuntimeHolder, config: ToolRuntimeConfig) {
  const identity = createReleaseToolIdentity(holder)
  const store = lateStore(holder)
  const requestAccess = currentTargetPolicy({
    authorization: () => toolTargetPolicyOf(root),
    view: () => releaseCatalogViewOf(root),
  })
  const sourceInput: LocalInvocationSourceInput<unknown, ToolMessageContentBlock> = {
    store,
    authority: identity.sourceAuthority,
    principalCodec: releasePrincipalCodec,
    commitAttempts: config.configuration.ledgerCommitAttempts,
    forwarding: {
      authority: () => root.get(toolStartAuthorityKey, false),
      isParent: request => isReleaseToolsRequest(releaseOf(root), request),
    },
  }
  const sources = createLocalInvocationSource(sourceInput)
  const environment = createReleaseEnvironment(holder, identity, {
    filesRoot: config.filesRoot,
    commitAttempts: config.configuration.ledgerCommitAttempts,
    schemaProvider: () => holder.schemaProvider,
  })
  const input: LocalToolRuntimeInput = {
    store,
    custody: lateCustody(holder),
    content: null,
    sources: { ...sources, guard: withTargetAdmissionPolicy(sources.guard, store, requestAccess) },
    access: { ...identity.access, request: admittedTargetAccess(store, requestAccess) },
    subjects: identity.subjects,
    grants: createLocalGrantVerifiers(RELEASE_TOOL_SCOPE),
    guardsOf: () => [],
    permitRequirements: releasePermitRequirements(root, identity),
    clock: holder.clock,
    configuration: config.configuration,
    // The bindings row is built for any environment value; at run time the value it hands to the
    // authors is the environment this bundle prepares, so the narrower type is the same object.
    bindings: () => root.get(toolBindingsKey) as ReturnType<LocalToolRuntimeInput['bindings']>,
    catalog: () => root.get(toolCatalogKey),
    environment: environment.input,
    capacity: config.capacity,
    observersPerCall: config.observersPerCall,
    observerQueueFrames: config.observerQueueFrames,
    observerResidenceMs: config.observerResidenceMs,
  }
  return { input, qualification: createLocalInvocationQualifier(sourceInput) }
}

/** 本运行的 bundle：第一次按 `config` 建；之后配置不同就抛出（行 FAILED）。 */
export function ensureToolRuntimeBundle(
  ctx: Context,
  config: ToolRuntimeConfig,
): ToolRuntimeBundle {
  const holder = toolRuntimeHolder(ctx)
  const digest = canonicalDigest(config)
  if (holder.bundle !== null) {
    if (holder.bundle.configDigest !== digest)
      throw new Error('tool runtime: this run already built its bundle with another configuration')
    return holder.bundle.value
  }
  const { input, qualification } = inputFor(ctx.root, holder, config)
  const value = Object.freeze({ ...createLocalToolRuntimePlugins(input), qualification })
  holder.bundle = Object.freeze({ value, configDigest: digest })
  holder.resolve(value)
  return value
}
