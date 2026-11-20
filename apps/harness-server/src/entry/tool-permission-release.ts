import { GovernanceDefinitionBundleSchema } from '@omne-harness/governance-contract'
import { projectPermissionSettings, type PermissionDefinition } from '@omne-harness/permissions'
import { canonicalDigest } from '@omne-harness/tool'
import {
  commandGateOf,
  toolGatesOf,
  type Adoption,
  type ToolDefinition,
  type ToolGate,
  type ToolImplementationShape,
} from '@omne-harness/tool-contract'
import { z } from 'zod'
import type { ReleaseToolName } from './tool-release-manifest.ts'
import {
  PERMISSION_INTERPRETATION,
  permissionInterpretationSchema,
} from '../rows/governance/permission-interpretation.ts'

export const TOOL_GOVERNANCE_OWNER = 'harness-server.tool-release'
export const toolPermissionReleaseSchema = z.strictObject({
  declaration: GovernanceDefinitionBundleSchema,
  interpretations: z.array(permissionInterpretationSchema),
})
export type ToolPermissionRelease = z.infer<typeof toolPermissionReleaseSchema>

export const releasedGateSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  default: z.enum(['deny', 'ask', 'auto']),
  commands: z.array(z.string().min(1)),
})
export type ReleasedGate = z.infer<typeof releasedGateSchema>

export function toolEnforcementKey(gate: Pick<ToolGate, 'id'>): string {
  return `tool.${gate.id}`
}

export function releasedGatesOf(
  definition: Pick<ToolDefinition, 'kind'> & ToolImplementationShape,
  named: readonly string[],
): ReleasedGate[] {
  const commands = definition.kind === 'commands' ? definition.commands.map(c => c.name) : [null]
  return toolGatesOf(definition).flatMap(gate => {
    const own = commands.filter(command => {
      const found = commandGateOf(definition, command, named)
      return found.kind === 'gate' && found.gate.id === gate.id
    })
    return own.length === 0
      ? []
      : [{ ...gate, commands: own.filter((name): name is string => name !== null) }]
  })
}

function gatePolicy(name: string, gate: ReleasedGate) {
  const commands = gate.commands.length === 0 ? '' : `（${gate.commands.join('、')}）`
  return {
    title: `${name}：${gate.title}`,
    description: `控制 ${name} 工具里归「${gate.title}」的命令${commands}。允许调用不代表执行环境可用或操作一定成功。`,
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
    defaultRule: { pick: gate.default, allowedSet: null },
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

type ControlledTool = {
  name: ReleaseToolName
  adoption: Adoption
  module: { package: string; export: string; executor: Adoption; artifacts: string }
  definition: string
  gates: readonly ReleasedGate[]
}

export function toolPermissionRelease(input: ControlledTool): ToolPermissionRelease {
  const unversioned = releaseAtVersion(input, 'unversioned', 'unversioned')
  const settingsVersion = canonicalDigest(unversioned.declaration.settings).slice(7)
  const draft = releaseAtVersion(input, 'unversioned', settingsVersion)
  return releaseAtVersion(input, canonicalDigest({ tool: input, draft }).slice(7), settingsVersion)
}

function releaseAtVersion(
  input: ControlledTool,
  version: string,
  settingsVersion: string,
): ToolPermissionRelease {
  const origin = {
    kind: 'asset' as const,
    assetId: `harness.tool.${input.name}`,
    releaseRef: `harness.tool.${input.name}/${version}`,
  }
  const implementationRef = `tool/${canonicalDigest(input).slice(7)}`
  const gates = input.gates.map(gate => {
    const { effects, interpretationRef, ...rules } = gatePolicy(input.name, gate)
    const permission: PermissionDefinition = {
      ...rules,
      reference: { origin, itemId: gate.id, revision: version },
      capabilityId: `tool.${input.name}`,
      enforcementKey: toolEnforcementKey(gate),
      settings: {
        providerId: TOOL_GOVERNANCE_OWNER,
        definitionId: `tool.${input.name}.permissions`,
        version: settingsVersion,
        itemId: gate.id,
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
      implementationRef,
      action: 'invoke',
      interpretationRef,
    }
    return { permission, settings: projection.definition, binding, effects }
  })
  const [first] = gates
  const settings =
    first === undefined
      ? []
      : [{ ...first.settings, items: gates.flatMap(gate => gate.settings.items) }]
  const reference = { ownerId: TOOL_GOVERNANCE_OWNER, definitionId: `tool.${input.name}`, version }
  const body = {
    reference,
    origin,
    settings,
    permissions: gates.map(gate => gate.permission),
    enforcementBindings: gates.map(gate => gate.binding),
  }
  return toolPermissionReleaseSchema.parse({
    declaration: { ...body, reference: { ...reference, digest: canonicalDigest(body).slice(7) } },
    interpretations: gates.map(({ binding, permission, effects }) => ({
      binding,
      definition: permission,
      effects,
    })),
  })
}
