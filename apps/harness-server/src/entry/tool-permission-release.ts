import { GovernanceDefinitionBundleSchema } from '@omne-harness/governance-contract'
import { projectPermissionSettings, type PermissionDefinition } from '@omne-harness/permissions'
import { canonicalDigest } from '@omne-harness/tool'
import type { Adoption } from '@omne-harness/tool-contract'
import { z } from 'zod'
import {
  PERMISSION_INTERPRETATION,
  permissionInterpretationSchema,
} from '../rows/governance/permission-interpretation.ts'

export const TOOL_GOVERNANCE_OWNER = 'harness-server.tool-release'
export const toolPermissionReleaseSchema = z.strictObject({
  declaration: GovernanceDefinitionBundleSchema,
  interpretations: z.array(permissionInterpretationSchema).length(1),
})
export type ToolPermissionRelease = z.infer<typeof toolPermissionReleaseSchema>

function invocationPolicy(name: string) {
  return {
    title: `${name} 调用权限`,
    description: `控制 ${name} 工具的所有命令。允许调用不代表执行环境可用或操作一定成功。`,
    approvalEffect: '在选定授权范围内允许调用；仍须满足身份、持有、当前规则和执行环境要求。',
    supportedScopes: [
      { kind: 'one-time-call', description: '仅允许原调用及其原参数。' },
      { kind: 'session', description: '允许原逻辑会话中的适用调用。' },
      { kind: 'tenant', description: '允许本租户中的适用调用，仍受组织上界限制。' },
    ],
    assignmentLayers: ['organization', 'tenant', 'session'],
    values: [
      { id: 'deny', title: '不允许', description: '不启动此工具调用。', permitsOperation: false },
      { id: 'ask', title: '询问', description: '需要取得适用的人工许可。', permitsOperation: true },
      { id: 'auto', title: '自动', description: '本项不要求另行询问。', permitsOperation: true },
    ],
    comparison: {
      strictOrder: ['deny', 'ask', 'auto'],
      distances: [
        [0, 1, 2],
        [1, 0, 1],
        [2, 1, 0],
      ],
    },
    defaultRule: { pick: 'ask', allowedSet: null },
    effects: [
      { value: 'deny', effect: 'deny' },
      { value: 'ask', effect: 'need-decision' },
      { value: 'auto', effect: 'allow' },
    ],
    interpretationRef: PERMISSION_INTERPRETATION,
  } satisfies Pick<
    PermissionDefinition,
    | 'title'
    | 'description'
    | 'approvalEffect'
    | 'supportedScopes'
    | 'assignmentLayers'
    | 'values'
    | 'comparison'
    | 'defaultRule'
  > & {
    effects: z.infer<typeof permissionInterpretationSchema>['effects']
    interpretationRef: string
  }
}

/** Part of the release owner's canonical manifest, never derived from tenant assignments. */
type ControlledTool = {
  name: 'Shell' | 'Files'
  adoption: Adoption
  module: { package: string; export: string; executor: Adoption; artifacts: string }
  definition: string
}

export function toolPermissionRelease(input: ControlledTool): ToolPermissionRelease {
  const draft = releaseAtVersion(input, 'unversioned')
  return releaseAtVersion(input, canonicalDigest(draft).slice(7))
}

function releaseAtVersion(input: ControlledTool, version: string): ToolPermissionRelease {
  const policy = invocationPolicy(input.name)
  const origin = {
    kind: 'asset' as const,
    assetId: `harness.tool.${input.name}`,
    releaseRef: `harness.tool.${input.name}/${version}`,
  }
  const { effects, interpretationRef, ...rules } = policy
  const permission: PermissionDefinition = {
    ...rules,
    reference: { origin, itemId: 'invoke', revision: version },
    capabilityId: `tool.${input.name}`,
    enforcementKey: 'tool.invoke',
    settings: {
      providerId: TOOL_GOVERNANCE_OWNER,
      definitionId: `tool.${input.name}.permissions`,
      version,
      itemId: 'invoke',
      groupId: `tool.${input.name}`,
      groupTitle: `${input.name} 工具`,
      groupDescription: `${input.name} 调用的权限规则。`,
    },
  }
  const projection = projectPermissionSettings(permission)
  if (projection.kind !== 'projected') throw new Error('Tool permission release is invalid')
  const binding = {
    capabilityId: permission.capabilityId,
    enforcementKey: permission.enforcementKey,
    implementationRef: `tool/${canonicalDigest(input).slice(7)}`,
    action: 'invoke',
    interpretationRef,
  }
  const reference = { ownerId: TOOL_GOVERNANCE_OWNER, definitionId: `tool.${input.name}`, version }
  const body = {
    reference,
    origin,
    settings: [projection.definition],
    permissions: [permission],
    enforcementBindings: [binding],
  }
  return toolPermissionReleaseSchema.parse({
    declaration: { ...body, reference: { ...reference, digest: canonicalDigest(body).slice(7) } },
    interpretations: [{ binding, definition: permission, effects }],
  })
}
