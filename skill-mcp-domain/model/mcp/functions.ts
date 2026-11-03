// MCP 限界上下文：纯函数（领域服务）。没有端口，可以穷举测试。

import type { JsonValue, Outcome, TenantId } from '../shared.ts'
import type { CallOutcome, DeliveredContent } from './outcomes.ts'
import type { AdoptedEndpoint } from './ports.ts'
import type {
  ActionDefinition,
  AuthKind,
  CatalogKey,
  ConnectionKey,
  CredentialBinding,
  DefinitionDigest,
  EndpointDefinition,
  PeerAccount,
} from './values.ts'

export type EndpointBodyRejection = 'malformed' | 'transport-unknown' | 'auth-unknown' | 'name-mismatch'

export declare function parseEndpointBody(body: unknown, expectedName?: string): Outcome<EndpointDefinition, EndpointBodyRejection>
export declare function digestDefinition(definition: ActionDefinition): DefinitionDigest
/** 按对端次序逐项转换；不合法的一项转成说明类型与原因的文本块，不丢整份。 */
export declare function toContentBlocks(peerContent: JsonValue): readonly DeliveredContent[]
/** 对端应答到结局；JSON-RPC 错误不证明没有效果。 */
export declare function classifyOutcome(peerResponse: JsonValue, outputSchema: JsonValue | undefined): CallOutcome

/** 对端账号的唯一来源：认证方式加凭据配值。none 时是 anonymous。 */
export function peerAccountOf(auth: AuthKind, binding: CredentialBinding | undefined): Outcome<PeerAccount, 'credential-missing'> {
  if (auth === 'none') return { ok: { kind: 'anonymous' } }
  if (binding === undefined) return { failure: 'credential-missing' } // 不退回其他凭据
  return { ok: { kind: 'credential', binding } }
}

export function catalogKeyOf(tenant: TenantId, endpoint: AdoptedEndpoint, account: PeerAccount): CatalogKey {
  return { tenant, account, holding: endpoint.ref.holding }
}

export function connectionKeyOf(tenant: TenantId, endpoint: AdoptedEndpoint, account: PeerAccount): ConnectionKey {
  return { tenant, holding: endpoint.ref.holding, adoptionRevision: endpoint.revision, account }
}

/** 本机命令判定：加载期就能回答。 */
export function launchesLocalCommand(definition: EndpointDefinition): boolean {
  return definition.transport.kind === 'stdio'
}
