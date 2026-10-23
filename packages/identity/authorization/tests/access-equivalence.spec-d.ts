// The one `Access<P>` of legal-identity is the same type as the copies that the contract members
// wrote, so each member can replace its copy by a re-export without changing what it accepts.
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { Principal } from '@omne-harness/identity'
import type { Access as AgentAccess } from '@omne-harness/agent-contract'
import type { Access as ToolAccess } from '@omne-harness/tool-contract'
import type { Access as ModelAccess } from '@omne-harness/model-contract'
import type { Access as EnvironmentAccess } from '@omne-harness/execution-environment-contract'
import type { Access as RequestContextAccess } from '@omne-harness/request-context-contract'

declare const shared: Access<Principal>
declare const agent: AgentAccess<Principal>
declare const tool: ToolAccess<Principal>
declare const model: ModelAccess<Principal>
declare const environment: EnvironmentAccess<Principal>
declare const requestContext: RequestContextAccess<Principal>

const _sharedToAgent: AgentAccess<Principal> = shared
const _agentToShared: Access<Principal> = agent
const _sharedToTool: ToolAccess<Principal> = shared
const _toolToShared: Access<Principal> = tool
const _sharedToModel: ModelAccess<Principal> = shared
const _modelToShared: Access<Principal> = model
const _sharedToEnvironment: EnvironmentAccess<Principal> = shared
const _environmentToShared: Access<Principal> = environment
const _sharedToRequestContext: RequestContextAccess<Principal> = shared
const _requestContextToShared: Access<Principal> = requestContext

// The members are exactly `principal` and `tenant`, in both directions.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _exactAgent: Exact<Access<Principal>, AgentAccess<Principal>> = true
const _exactTool: Exact<Access<Principal>, ToolAccess<Principal>> = true
const _exactModel: Exact<Access<Principal>, ModelAccess<Principal>> = true
const _exactEnvironment: Exact<Access<Principal>, EnvironmentAccess<Principal>> = true
const _exactRequestContext: Exact<Access<Principal>, RequestContextAccess<Principal>> = true

// A Session-style access with a session member is wider, not the same: it stays its own type.
type SessionAccess<P> = Readonly<{ principal: P; tenant: TenantId; session: string }>
const _notExactSession: Exact<Access<Principal>, SessionAccess<Principal>> = false
