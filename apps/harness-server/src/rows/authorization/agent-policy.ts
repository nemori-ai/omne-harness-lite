// The Agent policy table (DP-4, policy draft §6): one row per AgentAccessOperation. The work
// principal is the AD-14 outbound principal of the coordinator; the login principal never calls
// Agent directly; the agent host maintenance principal is one system principal and passes a cell
// only where the grant table names it. `satisfies` makes a missing or extra row a type error.
import type { AgentAccessOperation } from '@omne-harness/agent-contract'
import { cell, row, type PolicyRow } from './cells.ts'

const { member, matrix, deny } = cell

const OUTSIDE_MATRIX = '矩阵外（AU-12 第 2 步）'
const NO_SOURCE = '无放行出处'
const CALLER_UNKNOWN = '调用方主体未写明，见候选 P-4 与输入需求 Q-1'
const DIRECT_CALLER_UNKNOWN = '直接调用者的主体未写明，见 P-4'
const RECORD_ADAPTER_UNKNOWN = '长期执行记录适配器的主体未写明，见 P-4'
const HOST_DUTY = 'AU-12 `agent-instance-*` 行，AGI §3.3 第 4 步、§3.4，候选 P-1 (a)'

export const AGENT_POLICY = Object.freeze({
  invoke: row(
    deny(NO_SOURCE),
    member('AD:448 与 AD-14 表 `invoke`，AGI §3.6'),
    deny(OUTSIDE_MATRIX),
  ),
  resume: row(deny(NO_SOURCE), member('AD-14 表 `resume`，AGI §3.6'), deny(OUTSIDE_MATRIX)),
  submit: row(deny(NO_SOURCE), member('AD-14 表 `submit`（`input.submit`）'), deny(OUTSIDE_MATRIX)),
  control: row(deny(NO_SOURCE), member('AD-14 表 `control` 与控制映射表'), deny(OUTSIDE_MATRIX)),
  read: row(deny(NO_SOURCE), deny(CALLER_UNKNOWN), deny(OUTSIDE_MATRIX)),
  events: row(deny(NO_SOURCE), deny(CALLER_UNKNOWN), deny(OUTSIDE_MATRIX)),
  acknowledge: row(deny(NO_SOURCE), deny(CALLER_UNKNOWN), deny(OUTSIDE_MATRIX)),
  takeover: row(
    deny(NO_SOURCE),
    member(
      'SW:191「故障后接续原工作」，AGS:1033 至 1041 takeover 是独立资格并在 attach 时另核。不按主体细分，见候选 K-9',
    ),
    deny(OUTSIDE_MATRIX),
  ),
  observe: row(deny(NO_SOURCE), deny(CALLER_UNKNOWN), deny(OUTSIDE_MATRIX)),
  resolve: row(
    deny(NO_SOURCE),
    member('AD-14 表 `invoke`「`agentInstances.resolve`」，AGI §3.6'),
    deny(OUTSIDE_MATRIX),
  ),
  connect: row(deny(NO_SOURCE), deny(CALLER_UNKNOWN), deny(OUTSIDE_MATRIX)),
  reserve: row(
    deny(NO_SOURCE),
    member(
      'AGI §3.3 第 2 步、§3.6「AD-14 出站主体只多要 reserve」，R1-D16。目标为 `scope`，按工作绑定核对',
    ),
    deny('宿主以调用方的 Access 预约（AGI §3.3 第 4 步），不以 H 预约'),
  ),
  publish: row(
    deny(NO_SOURCE),
    deny('AGI §3.6：AD-14 不要 publish'),
    matrix('agent-instance-publish', HOST_DUTY),
  ),
  withdraw: row(
    deny(NO_SOURCE),
    deny('AGI §3.6：AD-14 不要 withdraw'),
    matrix('agent-instance-withdraw', HOST_DUTY),
  ),
  quiesce: row(
    deny(NO_SOURCE),
    deny('AGI §3.6：AD-14 不要 quiesce'),
    matrix('agent-instance-quiesce', HOST_DUTY),
  ),
  query: row(
    deny(NO_SOURCE),
    member('AD-14 表 `query`（`agentExecutionRecovery.query`）'),
    deny(OUTSIDE_MATRIX),
  ),
  load: row(
    deny(NO_SOURCE),
    member('AD-14 表 `inspect` 与 `detach`（`agentExecutionRecovery.load`）'),
    deny(OUTSIDE_MATRIX),
  ),
  reconcile: row(
    deny(NO_SOURCE),
    deny('AD-14 的 `recordResult` 待 NP-04（AD:60）'),
    deny(OUTSIDE_MATRIX),
  ),
  detach: row(deny(NO_SOURCE), member('AD-14 表 `detach`，AD「VA-12」'), deny(OUTSIDE_MATRIX)),
  'record-terminal-observation': row(deny(NO_SOURCE), deny(CALLER_UNKNOWN), deny(OUTSIDE_MATRIX)),
  'receive-result': row(
    deny(NO_SOURCE),
    member(
      'L-RUN：推送用原受理主体（会话 coordinator 的 W）；L-MODEL：推送前经 ModelHostAuthority.resolve 取主体。只核租户（DP-4 Q-1 三方对齐）',
    ),
    deny('AGS:1790 要求推送主体代原租户行事，不用系统主体'),
  ),
  'read-message-handoff': row(deny(NO_SOURCE), deny(DIRECT_CALLER_UNKNOWN), deny(OUTSIDE_MATRIX)),
  'record-message-handoff': row(deny(NO_SOURCE), deny(DIRECT_CALLER_UNKNOWN), deny(OUTSIDE_MATRIX)),
  'exclude-message-handoff': row(
    deny(NO_SOURCE),
    deny(DIRECT_CALLER_UNKNOWN),
    deny(OUTSIDE_MATRIX),
  ),
  settle: row(deny(NO_SOURCE), deny(RECORD_ADAPTER_UNKNOWN), deny(OUTSIDE_MATRIX)),
  'migrate-cancellation': row(deny(NO_SOURCE), deny(RECORD_ADAPTER_UNKNOWN), deny(OUTSIDE_MATRIX)),
}) satisfies Readonly<Record<AgentAccessOperation, PolicyRow>>
