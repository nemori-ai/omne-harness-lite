import type { PermissionRule } from '@omne-harness/permissions'
export const origin = { kind: 'independent', providerId: 'shell', definitionRef: 'shell-v1' }
export const reference = { origin, itemId: 'execute', revision: '1' }
export const scope = {
  tenantId: 'tenant-a',
  targetId: 'target-a',
  organizationId: 'org-a',
  sessionId: 'session-a',
  deploymentId: 'local',
  logicalServiceId: 'service-a',
}
export function definition() {
  const defaultRule: PermissionRule = { pick: 'deny', allowedSet: null }
  return {
    reference,
    capabilityId: 'command',
    enforcementKey: 'command.execute',
    title: '执行命令',
    description: '控制宿主命令的执行方式',
    approvalEffect: '允许匹配范围内的命令启动',
    supportedScopes: [
      { kind: 'tenant', description: '本租户后续命令' },
      { kind: 'session', description: '原逻辑会话' },
    ],
    assignmentLayers: ['organization', 'tenant', 'session'],
    values: [
      { id: 'deny', title: '不允许', description: '不启动命令', permitsOperation: false },
      { id: 'ask', title: '问一下', description: '经人工授权后可启动', permitsOperation: true },
      { id: 'auto', title: '自动', description: '无需询问即可启动', permitsOperation: true },
    ],
    comparison: {
      strictOrder: ['deny', 'ask', 'auto'],
      distances: [
        [0, 1, 4],
        [1, 0, 3],
        [4, 3, 0],
      ],
    },
    defaultRule,
    settings: {
      providerId: 'shell',
      definitionId: 'permissions',
      version: '1',
      itemId: 'execute',
      groupId: 'commands',
      groupTitle: '命令权限',
      groupDescription: '命令执行的权限配值',
    },
  }
}
export function source(pick: string | null, allowedSet: string[] | null = null) {
  return {
    kind: 'available',
    sourceRef: 'settings-source',
    revision: '1',
    scope,
    definition: reference,
    rule: { pick, allowedSet },
  }
}
function constraint() {
  return {
    id: 'agent',
    kind: 'available',
    sourceRef: 'agent-definition',
    revision: '1',
    scope,
    capabilityId: 'command',
    enforcementKey: 'command.execute',
    effect: { kind: 'bound', allowedSet: ['deny', 'ask', 'auto'] },
  }
}
export function evaluation() {
  const constraints: [ReturnType<typeof constraint>] = [constraint()]
  return {
    scope,
    definition: reference,
    capabilityId: 'command',
    enforcementKey: 'command.execute',
    declaration: { kind: 'available', definition: definition() },
    sources: {
      organization: { kind: 'absent', revision: '1' },
      tenant: source('auto'),
      session: { kind: 'absent', revision: '1' },
    },
    requiredConstraintIds: ['agent'],
    constraints,
    adoptionRevision: '1',
    targetRevision: '1',
  }
}
