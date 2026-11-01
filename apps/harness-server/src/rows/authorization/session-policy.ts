// The Session policy table (DP-4, policy draft §5): one row per SessionAccessOperation, one cell
// per principal class. The citations use the abbreviations of policy draft §1 (SS, SAC, SCC, AD,
// SW, IA, AU, ID, PC, AA, DA4, AGI, LP). `satisfies` makes a missing or extra row a type error.
import type { SessionAccessOperation } from '@omne-harness/session-contract'
import { cell, row, type PolicyRow } from './cells.ts'

const { member, matrix, deny, pending } = cell

const OUTSIDE_MATRIX = '矩阵外（AU-12 第 2 步）'
const NO_SOURCE = '无放行出处'
const NO_SYSTEM_READ = 'DA4 §5.6 普通读取没有系统分支'
const SYSTEM_ONLY = 'DA4 §4.7 第 1 步只接受系统主体'
const NOT_IN_MATRIX_A2 = '矩阵没有这一行，见候选第 7 节 A-2'

export const SESSION_POLICY = Object.freeze({
  accept: row(
    member(
      'SW:221、223 J-SW02，SW:241、243 J-SW04，PC:450 `send-input`，SS:551。`business` 分支拒绝：SW:223 把它写成系统业务输入，没有用户发起的出处',
      { kind: 'routed', kinds: ['ordinary', 'card-decision'] },
    ),
    member(
      'SS:551 业务输入分支，DA4 §4.1、§4.7。`ordinary` 与 `card-decision` 分支拒绝：SS:551 对它们只列 intake',
      { kind: 'routed', kinds: ['business'] },
    ),
    deny(OUTSIDE_MATRIX),
  ),
  startRun: row(
    deny(`${NO_SOURCE}。登录确认经证据桥守卫，不经主体（SS:554）`),
    member('SS:554，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  claim: row(deny(NO_SOURCE), member('SS:555，DA4 §4.1'), deny(OUTSIDE_MATRIX)),
  reload: row(
    deny(`${NO_SOURCE}。用户显式 reload 的入口未定（SW:213）`),
    member('SS:556，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  recordMessage: row(
    deny(NO_SOURCE),
    member('SS:557，SAC「已接入的执行边界」，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  preserveResult: row(
    deny(NO_SOURCE),
    member('SS:558，SAC「已接入的执行边界」，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  completeConsumption: row(
    deny(NO_SOURCE),
    member('SS:559，SAC「已接入的执行边界」，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  completeExternalConsumption: row(
    deny(NO_SOURCE),
    member('SS:560，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  bindExternalCall: row(deny(NO_SOURCE), member('SS:561，DA4 §4.1'), deny(OUTSIDE_MATRIX)),
  commitDerived: row(
    deny(NO_SOURCE),
    member('SS:562，SAC「已接入的执行边界」，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  release: row(deny(NO_SOURCE), member('SS:563，DA4 §4.1'), deny(OUTSIDE_MATRIX)),
  control: row(
    member('SW:265 J-SW06，SW:273、277 J-SW07 归档与撤销归档，SS:564'),
    member('SS:564，SCC maintainer「控制重放」，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  finishRun: row(deny(NO_SOURCE), member('SS:565，DA4 §4.1'), deny(OUTSIDE_MATRIX)),
  create: row(
    member(
      'SW:211 J-SW01，PC:448、485 `create-session`，SS:607，DA4 §4.1「首次 create 使用本次登录请求的 identity-login 工作关系」',
    ),
    deny('DA4 §4.1：create 之前没有 Session 记录，`forSession` 答 denied，不签发 W'),
    deny(OUTSIDE_MATRIX),
  ),
  completeInitialization: row(
    deny(`用户不是初始化项的负责方，${NO_SOURCE}`),
    deny(`${NO_SOURCE}。负责方以什么主体提交未写明，见候选待定项 P-3 与输入需求 Q-2`),
    deny(OUTSIDE_MATRIX),
  ),
  change: row(
    member('SS:609「本会话租户」，SS:89，SW:129、253 三个模式，SW:61 模型。覆盖全部声明种类'),
    deny(
      'SW:129：Agent 不能直接写模式。SS:609 只列 intake。Agent 经 HITL 改模式的证据没有解释形状（AU-11「首批不覆盖的部分」）',
    ),
    deny(OUTSIDE_MATRIX),
  ),
  setRelation: row(pending('D-2'), deny(NO_SOURCE), deny(OUTSIDE_MATRIX)),
  configureAutoArchive: row(pending('D-1'), deny(NO_SOURCE), deny(OUTSIDE_MATRIX)),
  considerAutoArchive: row(
    deny(NO_SOURCE),
    member('SS:612，SCC maintainer「自动归档」，DA4 §4.1。成员失效后为拒绝，见候选限制 K-3'),
    deny(NOT_IN_MATRIX_A2),
  ),
  recordIdle: row(
    deny(NO_SOURCE),
    member('SS:606，SCC maintainer「空闲取证」，DA4 §4.1'),
    deny(NOT_IN_MATRIX_A2),
  ),
  interrupt: row(member('SW:263 J-SW06 插队，SS:613'), deny(NO_SOURCE), deny(OUTSIDE_MATRIX)),
  cancelRun: row(
    member('SW:265 J-SW06，PC:453 `cancel-run`，SS:588'),
    member('SS:588，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  stopCall: row(
    member('SW:265 J-SW06，PC:454 `stop-call`，SS:588'),
    member('SS:588，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  freeze: row(
    deny(NO_SOURCE),
    member('SS:614，SCC coordinator「Tool 冻结判定」，DA4 §4.1'),
    deny(OUTSIDE_MATRIX),
  ),
  receive: row(
    deny(NO_SOURCE),
    member('SS:633，DA4 §4.1'),
    matrix(
      'scope-release-receive',
      'AU:267，DA4 §4.5、§4.7 第 2 步，SS:1872。参数为该事实的 `effectiveArgumentsOf`。其他事实种类拒绝',
      { kind: 'fact', kinds: ['scope-release'] },
    ),
  ),
  readWork: row(deny(NO_SOURCE), member('SS:552，DA4 §4.1'), deny(NO_SYSTEM_READ)),
  readInput: row(
    deny(NO_SOURCE),
    member('SS:553，AD:446 AD-14 读输入，DA4 §4.1'),
    deny(NO_SYSTEM_READ),
  ),
  queryOperation: row(
    member('PC「结果」表 `query-create-session`、`query-send-input`，SS:566'),
    member('SS:566，DA4 §4.1'),
    deny(NO_SYSTEM_READ),
  ),
  readModelSelection: row(
    member('SS:588，SW:57 至 61 选择和切换模型'),
    member('SS:588，LP「readModelSelection 的调用方类是 maintainer」，DA4 §4.1'),
    deny(NO_SYSTEM_READ),
  ),
  queryControlOperation: row(
    member('SS:588 原控制回执的认回，SW:265'),
    member('SS:588，DA4 §4.1'),
    deny(NO_SYSTEM_READ),
  ),
  loadRecovery: row(deny(NO_SOURCE), member('SS:567，DA4 §4.1'), deny(NO_SYSTEM_READ)),
  inspectIdle: row(
    deny(NO_SOURCE),
    member('SS:605，SCC maintainer「空闲取证」，DA4 §4.1'),
    deny(`${NO_SYSTEM_READ}，见 A-2`),
  ),
  'history.begin': row(
    member('SW:297、299 J-SW09，PC:631 观察的日志读取，PC「结果」表 `read-history`，SS:651'),
    member('SS:651，SCC reader「Request Context 的历史源对接插件」，DA4 §4.1'),
    deny(NO_SYSTEM_READ),
  ),
  'history.next': row(
    member('SW:299 每页核对当前资格，PC「结果」表 `read-history`，SS:652'),
    member('SS:652，SCC reader，DA4 §4.1'),
    deny(NO_SYSTEM_READ),
  ),
  'history.since': row(
    member('SW:297、299，SS:653'),
    member('SS:653，SCC reader，DA4 §4.1'),
    deny(NO_SYSTEM_READ),
  ),
  'history.readModelView': row(
    deny(`模型视图不是用户的阅读面，${NO_SOURCE}`),
    member('SS:654，SCC reader「含 epoch 视图读取 readModelView」，DA4 §4.1'),
    deny(NO_SYSTEM_READ),
  ),
  pending: row(
    deny(NO_SOURCE),
    member('SS:634，DA4 §4.7 第 3 步。只核租户，不核工作绑定'),
    matrix('pending-sessions', 'AU:266，DA4 §4.5、§4.7 第 2 步，AA:308。目标为租户分支'),
  ),
  references: row(
    deny(SYSTEM_ONLY),
    deny(SYSTEM_ONLY),
    matrix('resident-references', 'AU:263，DA4 §4.5，AA:90、273'),
  ),
  releasedScopes: row(
    deny(SYSTEM_ONLY),
    deny(SYSTEM_ONLY),
    matrix('released-scopes', 'AU:264，DA4 §4.5，SS:1872'),
  ),
}) satisfies Readonly<Record<SessionAccessOperation, PolicyRow>>
