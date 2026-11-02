# `authorization` 行：Session 与 Agent 的授权政策

本页是 `authorization` 行的行规格。它依据 L-APP 波 1 的 DP-4 决定（#978，设计候选第 2 轮与政策表草稿）和 D-AUTH r4 第 4.7 节。两种模式共有的行为归 [SPEC.md](../../SPEC.md)。行声明的写法归 [real-mode.md](../real-mode.md)。公开类型以 `src/rows/authorization/` 的源码为准。

本页的表由源码生成。要改政策，先改源码里的表，再重新生成本页的表区。`tests/rows/authorization/adapters.spec.ts` 逐格核对本页与源码，两者不一致时用例变红。

## 行提供什么

| 项    | 内容                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| 行 id | `authorization`，`implementation` 为 `real`，没有关闭阶段                                                          |
| 提供  | `sessionAccessCheck`、`agentAccessCheck`、`agentActionAdmission`                                                   |
| 注入  | `principalVerifier`（入口对象）、`tenantStanding`（`identity` 行）。两项都是必需依赖，缺任一项时本行停在 `PENDING` |
| 配置  | 无。政策表和授予表是源码常量，不进配置，运维者不能经配置给任何系统主体授予用途                                     |

三个服务共用同一组依赖，所以放在同一个插件上，一起装载，一起撤除。服务对象只持有闭包。依赖在每次调用时重新读取。每次检查都读当前事实，不缓存任何 `allowed`。

- `sessionAccessCheck` 实现 `SessionAccessCheck`。每次 Session 面的公开读写在实际执行处调用它一次。
- `agentAccessCheck` 实现 `AgentAccessCheck`。每次 Agent 公开操作调用它一次。
- `agentActionAdmission` 实现 `ActionAdmission`。M2 没有动作规则来源，见[动作准入](#动作准入)。

## 一次访问检查怎样得出答复

检查先把请求变成一份计划，再调用依赖。计划在第一个 `await` 之前完成，所以请求在调用依赖之前就固定了。下面各步按次序执行。一步不通过，检查就给出结论，不再调用依赖。

1. 复制请求，并读取操作、目标和命令。
2. 按操作查表。查表用自有属性判断，`constructor`、`__proto__` 这类原型链键不是操作，答复是拒绝。
3. 核对固定绑定。变更请求的命令种类等于操作，命令里的会话等于目标的会话，命令里的租户等于访问的租户。`pending` 的目标租户等于访问的租户。目标种类必须是该操作定义的种类。不符就拒绝。
4. 按主体的形状分类，得到 L、W、S 三列之一。形状只用来选列，不授予资格。不属于任何一列就拒绝。
5. 核对租户。L 和 W 的主体租户必须等于访问的租户。S 不做这一步。
6. 核对工作绑定。W 的目标是 Session 时，`work.work` 必须等于目标的会话。目标是租户（`pending`）时，只核租户。Agent 的 `scope` 目标要求 `scope.owner` 为 `session`，并且 `scope.record` 等于 `work.work`。
7. 取格。`accept` 按输入种类取分支，`receive` 按事实种类取分支。请求不在分支内就拒绝。
8. 按格调用依赖。`拒绝`和`默认拒绝`的格不调用依赖。

### 两种放行

| 记号 | 怎样裁定                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 成员 | 租户 `AdmissionCheck`。它核验主体，再读该租户账号的当前成员事实。`requires` 为空，`permit` 为空。参数是原命令的 `effectiveArgumentsOf`，读请求没有参数 |
| 矩阵 | `SystemActionAuthorization`。它按固定顺序核主体、矩阵行和授予记录。授予记录来自下面的授予表                                                            |

### 答复的映射

| 依赖的答复                     | 检查的答复                                  |
| ------------------------------ | ------------------------------------------- |
| `allowed`                      | `allowed`，带依赖给出的裁定证据             |
| `denied`                       | `denied`，不带原因，不披露会话是否存在      |
| `unavailable`                  | `unavailable`，带依赖给出的诊断             |
| 依赖抛出异常，或答复不在契约内 | `unavailable`，诊断是固定文字，不含异常文本 |

核验器或 `tenantStanding` 抛出异常时，答复是 `unavailable`。检查不把它改写成 `denied` 或 `allowed`。

## 主体三列

| 列  | 主体           | 形状                                                                                                                     |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| L   | 登录代租户主体 | `acting-for-tenant`，`work.owner` 为 `identity-login`。`server-entry` 在本次请求内签发                                   |
| W   | 会话工作主体   | `acting-for-tenant`，`work.owner` 为 `session`，`work.work` 是会话标识的文本。装配入口按会话签发。Agent 的出站主体也是它 |
| S   | 系统主体       | `system`。装配入口签发。只走系统动作授权                                                                                 |

其他形状一律拒绝。Agent 宿主维护主体 `agent-host` 也是一个系统主体，落在 S 列。形状不能区分系统主体，所以 S 列的放行格只表示"调用矩阵"。哪个系统主体真正通过，由授予表决定。

## 授予表与持有者投影

授予表是源码常量 `MAINTENANCE_GRANTS`。读口只在核验器信任主体、矩阵行匹配之后被调用。它按主体的 `component` 文本在表里找记录。文本只用来定位，不是凭据。手工构造的同名对象在核验一步得到 `untrusted-principal`，到不了读口。

记录是部署级的，不按租户分区，没有撤销，也没有到期。没有记录的系统主体在矩阵格得到 `denied grant-missing`。

<!-- policy:grants -->

| 持有者组件名             | 记录                                               | 用途                                                                          |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `toolResidencyPrincipal` | `maintenance-grant/toolResidencyPrincipal`，修订 1 | `resident-references`                                                         |
| `agent-host`             | `maintenance-grant/agent-host`，修订 1             | `agent-instance-publish`、`agent-instance-quiesce`、`agent-instance-withdraw` |

<!-- /policy:grants -->

下表由系统列和授予表算出。一个持有者通过一格，当且仅当这一格是矩阵格，并且持有者的记录写了这一格的用途。这是一个渲染视图，不是裁定列。

<!-- policy:projection -->

| 持有者                   | 能通过的格                                         |
| ------------------------ | -------------------------------------------------- |
| `toolResidencyPrincipal` | Session `references`                               |
| `agent-host`             | Agent `publish`、Agent `withdraw`、Agent `quiesce` |
| 其他系统主体             | 无                                                 |

<!-- /policy:projection -->

## Session 表

每个 `SessionAccessOperation` 一行，共 39 行。少一行或多一行，成员的类型检查和测试都会变红。

<!-- policy:session-table -->

| 操作                          | L 登录主体                                         | W 会话工作主体                      | S 系统主体                                                     |
| ----------------------------- | -------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `accept`                      | 放行（成员），只限输入种类 ordinary、card-decision | 放行（成员），只限输入种类 business | 拒绝                                                           |
| `startRun`                    | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `claim`                       | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `reload`                      | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `recordMessage`               | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `preserveResult`              | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `completeConsumption`         | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `completeExternalConsumption` | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `bindExternalCall`            | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `commitDerived`               | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `release`                     | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `control`                     | 放行（成员）                                       | 放行（成员）                        | 拒绝                                                           |
| `finishRun`                   | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `create`                      | 放行（成员）                                       | 拒绝                                | 拒绝                                                           |
| `completeInitialization`      | 拒绝                                               | 拒绝                                | 拒绝                                                           |
| `change`                      | 放行（成员）                                       | 拒绝                                | 拒绝                                                           |
| `setRelation`                 | 默认拒绝（D-2）                                    | 拒绝                                | 拒绝                                                           |
| `configureAutoArchive`        | 默认拒绝（D-1）                                    | 拒绝                                | 拒绝                                                           |
| `considerAutoArchive`         | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `recordIdle`                  | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `interrupt`                   | 放行（成员）                                       | 拒绝                                | 拒绝                                                           |
| `cancelRun`                   | 放行（成员）                                       | 放行（成员）                        | 拒绝                                                           |
| `stopCall`                    | 放行（成员）                                       | 放行（成员）                        | 拒绝                                                           |
| `freeze`                      | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `receive`                     | 拒绝                                               | 放行（成员）                        | 放行（矩阵 scope-release-receive），只限事实种类 scope-release |
| `readWork`                    | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `readInput`                   | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `queryOperation`              | 放行（成员）                                       | 放行（成员）                        | 拒绝                                                           |
| `readModelSelection`          | 放行（成员）                                       | 放行（成员）                        | 拒绝                                                           |
| `queryControlOperation`       | 放行（成员）                                       | 放行（成员）                        | 拒绝                                                           |
| `loadRecovery`                | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `inspectIdle`                 | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `history.begin`               | 放行（成员）                                       | 放行（成员）                        | 拒绝                                                           |
| `history.next`                | 放行（成员）                                       | 放行（成员）                        | 拒绝                                                           |
| `history.since`               | 放行（成员）                                       | 放行（成员）                        | 拒绝                                                           |
| `history.readModelView`       | 拒绝                                               | 放行（成员）                        | 拒绝                                                           |
| `pending`                     | 拒绝                                               | 放行（成员）                        | 放行（矩阵 pending-sessions）                                  |
| `references`                  | 拒绝                                               | 拒绝                                | 放行（矩阵 resident-references）                               |
| `releasedScopes`              | 拒绝                                               | 拒绝                                | 放行（矩阵 released-scopes）                                   |

<!-- /policy:session-table -->

放行格的出处和拒绝格的依据如下。

<!-- policy:session-notes -->

- `accept`
  - L：出处：SW:221、223 J-SW02，SW:241、243 J-SW04，PC:450 `send-input`，SS:551。`business` 分支拒绝：SW:223 把它写成系统业务输入，没有用户发起的出处
  - W：出处：SS:551 业务输入分支，DA4 §4.1、§4.7。`ordinary` 与 `card-decision` 分支拒绝：SS:551 对它们只列 intake
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `startRun`
  - L：拒绝依据：无放行出处。登录确认经证据桥守卫，不经主体（SS:554）
  - W：出处：SS:554，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `claim`
  - L：拒绝依据：无放行出处
  - W：出处：SS:555，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `reload`
  - L：拒绝依据：无放行出处。用户显式 reload 的入口未定（SW:213）
  - W：出处：SS:556，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `recordMessage`
  - L：拒绝依据：无放行出处
  - W：出处：SS:557，SAC「已接入的执行边界」，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `preserveResult`
  - L：拒绝依据：无放行出处
  - W：出处：SS:558，SAC「已接入的执行边界」，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `completeConsumption`
  - L：拒绝依据：无放行出处
  - W：出处：SS:559，SAC「已接入的执行边界」，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `completeExternalConsumption`
  - L：拒绝依据：无放行出处
  - W：出处：SS:560，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `bindExternalCall`
  - L：拒绝依据：无放行出处
  - W：出处：SS:561，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `commitDerived`
  - L：拒绝依据：无放行出处
  - W：出处：SS:562，SAC「已接入的执行边界」，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `release`
  - L：拒绝依据：无放行出处
  - W：出处：SS:563，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `control`
  - L：出处：SW:265 J-SW06，SW:273、277 J-SW07 归档与撤销归档，SS:564
  - W：出处：SS:564，SCC maintainer「控制重放」，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `finishRun`
  - L：拒绝依据：无放行出处
  - W：出处：SS:565，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `create`
  - L：出处：SW:211 J-SW01，PC:448、485 `create-session`，SS:607，DA4 §4.1「首次 create 使用本次登录请求的 identity-login 工作关系」
  - W：拒绝依据：DA4 §4.1：create 之前没有 Session 记录，`forSession` 答 denied，不签发 W
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `completeInitialization`
  - L：拒绝依据：用户不是初始化项的负责方，无放行出处
  - W：拒绝依据：无放行出处。负责方以什么主体提交未写明，见候选待定项 P-3 与输入需求 Q-2
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `change`
  - L：出处：SS:609「本会话租户」，SS:89，SW:129、253 三个模式，SW:61 模型。覆盖全部声明种类
  - W：拒绝依据：SW:129：Agent 不能直接写模式。SS:609 只列 intake。Agent 经 HITL 改模式的证据没有解释形状（AU-11「首批不覆盖的部分」）
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `setRelation`
  - L：默认拒绝，待 D-2，见「D 项」
  - W：拒绝依据：无放行出处
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `configureAutoArchive`
  - L：默认拒绝，待 D-1，见「D 项」
  - W：拒绝依据：无放行出处
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `considerAutoArchive`
  - L：拒绝依据：无放行出处
  - W：出处：SS:612，SCC maintainer「自动归档」，DA4 §4.1。成员失效后为拒绝，见候选限制 K-3
  - S：拒绝依据：矩阵没有这一行，见候选第 7 节 A-2
- `recordIdle`
  - L：拒绝依据：无放行出处
  - W：出处：SS:606，SCC maintainer「空闲取证」，DA4 §4.1
  - S：拒绝依据：矩阵没有这一行，见候选第 7 节 A-2
- `interrupt`
  - L：出处：SW:263 J-SW06 插队，SS:613
  - W：拒绝依据：无放行出处
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `cancelRun`
  - L：出处：SW:265 J-SW06，PC:453 `cancel-run`，SS:588
  - W：出处：SS:588，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `stopCall`
  - L：出处：SW:265 J-SW06，PC:454 `stop-call`，SS:588
  - W：出处：SS:588，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `freeze`
  - L：拒绝依据：无放行出处
  - W：出处：SS:614，SCC coordinator「Tool 冻结判定」，DA4 §4.1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `receive`
  - L：拒绝依据：无放行出处
  - W：出处：SS:633，DA4 §4.1
  - S：出处：AU:267，DA4 §4.5、§4.7 第 2 步，SS:1872。参数为该事实的 `effectiveArgumentsOf`。其他事实种类拒绝
- `readWork`
  - L：拒绝依据：无放行出处
  - W：出处：SS:552，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支
- `readInput`
  - L：拒绝依据：无放行出处
  - W：出处：SS:553，AD:446 AD-14 读输入，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支
- `queryOperation`
  - L：出处：PC「结果」表 `query-create-session`、`query-send-input`，SS:566
  - W：出处：SS:566，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支
- `readModelSelection`
  - L：出处：SS:588，SW:57 至 61 选择和切换模型
  - W：出处：SS:588，LP「readModelSelection 的调用方类是 maintainer」，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支
- `queryControlOperation`
  - L：出处：SS:588 原控制回执的认回，SW:265
  - W：出处：SS:588，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支
- `loadRecovery`
  - L：拒绝依据：无放行出处
  - W：出处：SS:567，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支
- `inspectIdle`
  - L：拒绝依据：无放行出处
  - W：出处：SS:605，SCC maintainer「空闲取证」，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支，见 A-2
- `history.begin`
  - L：出处：SW:297、299 J-SW09，PC:631 观察的日志读取，PC「结果」表 `read-history`，SS:651
  - W：出处：SS:651，SCC reader「Request Context 的历史源对接插件」，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支
- `history.next`
  - L：出处：SW:299 每页核对当前资格，PC「结果」表 `read-history`，SS:652
  - W：出处：SS:652，SCC reader，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支
- `history.since`
  - L：出处：SW:297、299，SS:653
  - W：出处：SS:653，SCC reader，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支
- `history.readModelView`
  - L：拒绝依据：模型视图不是用户的阅读面，无放行出处
  - W：出处：SS:654，SCC reader「含 epoch 视图读取 readModelView」，DA4 §4.1
  - S：拒绝依据：DA4 §5.6 普通读取没有系统分支
- `pending`
  - L：拒绝依据：无放行出处
  - W：出处：SS:634，DA4 §4.7 第 3 步。只核租户，不核工作绑定
  - S：出处：AU:266，DA4 §4.5、§4.7 第 2 步，AA:308。目标为租户分支
- `references`
  - L：拒绝依据：DA4 §4.7 第 1 步只接受系统主体
  - W：拒绝依据：DA4 §4.7 第 1 步只接受系统主体
  - S：出处：AU:263，DA4 §4.5，AA:90、273
- `releasedScopes`
  - L：拒绝依据：DA4 §4.7 第 1 步只接受系统主体
  - W：拒绝依据：DA4 §4.7 第 1 步只接受系统主体
  - S：出处：AU:264，DA4 §4.5，SS:1872

<!-- /policy:session-notes -->

## Agent 表

每个 `AgentAccessOperation` 一行，共 26 行。W 列对应 AD-14 的出站主体。L 不直接调用 Agent。

<!-- policy:agent-table -->

| 操作                          | L 登录主体 | W 会话工作主体 | S 系统主体                           |
| ----------------------------- | ---------- | -------------- | ------------------------------------ |
| `invoke`                      | 拒绝       | 放行（成员）   | 拒绝                                 |
| `resume`                      | 拒绝       | 放行（成员）   | 拒绝                                 |
| `submit`                      | 拒绝       | 放行（成员）   | 拒绝                                 |
| `control`                     | 拒绝       | 放行（成员）   | 拒绝                                 |
| `read`                        | 拒绝       | 拒绝           | 拒绝                                 |
| `events`                      | 拒绝       | 拒绝           | 拒绝                                 |
| `acknowledge`                 | 拒绝       | 拒绝           | 拒绝                                 |
| `takeover`                    | 拒绝       | 放行（成员）   | 拒绝                                 |
| `observe`                     | 拒绝       | 拒绝           | 拒绝                                 |
| `resolve`                     | 拒绝       | 放行（成员）   | 拒绝                                 |
| `connect`                     | 拒绝       | 拒绝           | 拒绝                                 |
| `reserve`                     | 拒绝       | 放行（成员）   | 拒绝                                 |
| `publish`                     | 拒绝       | 拒绝           | 放行（矩阵 agent-instance-publish）  |
| `withdraw`                    | 拒绝       | 拒绝           | 放行（矩阵 agent-instance-withdraw） |
| `quiesce`                     | 拒绝       | 拒绝           | 放行（矩阵 agent-instance-quiesce）  |
| `query`                       | 拒绝       | 放行（成员）   | 拒绝                                 |
| `load`                        | 拒绝       | 放行（成员）   | 拒绝                                 |
| `reconcile`                   | 拒绝       | 拒绝           | 拒绝                                 |
| `detach`                      | 拒绝       | 放行（成员）   | 拒绝                                 |
| `record-terminal-observation` | 拒绝       | 拒绝           | 拒绝                                 |
| `receive-result`              | 拒绝       | 放行（成员）   | 拒绝                                 |
| `read-message-handoff`        | 拒绝       | 拒绝           | 拒绝                                 |
| `record-message-handoff`      | 拒绝       | 拒绝           | 拒绝                                 |
| `exclude-message-handoff`     | 拒绝       | 拒绝           | 拒绝                                 |
| `settle`                      | 拒绝       | 拒绝           | 拒绝                                 |
| `migrate-cancellation`        | 拒绝       | 拒绝           | 拒绝                                 |

<!-- /policy:agent-table -->

<!-- policy:agent-notes -->

- `invoke`
  - L：拒绝依据：无放行出处
  - W：出处：AD:448 与 AD-14 表 `invoke`，AGI §3.6
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `resume`
  - L：拒绝依据：无放行出处
  - W：出处：AD-14 表 `resume`，AGI §3.6
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `submit`
  - L：拒绝依据：无放行出处
  - W：出处：AD-14 表 `submit`（`input.submit`）
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `control`
  - L：拒绝依据：无放行出处
  - W：出处：AD-14 表 `control` 与控制映射表
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `read`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：调用方主体未写明，见候选 P-4 与输入需求 Q-1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `events`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：调用方主体未写明，见候选 P-4 与输入需求 Q-1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `acknowledge`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：调用方主体未写明，见候选 P-4 与输入需求 Q-1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `takeover`
  - L：拒绝依据：无放行出处
  - W：出处：SW:191「故障后接续原工作」，AGS:1033 至 1041 takeover 是独立资格并在 attach 时另核。不按主体细分，见候选 K-9
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `observe`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：调用方主体未写明，见候选 P-4 与输入需求 Q-1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `resolve`
  - L：拒绝依据：无放行出处
  - W：出处：AD-14 表 `invoke`「`agentInstances.resolve`」，AGI §3.6
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `connect`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：调用方主体未写明，见候选 P-4 与输入需求 Q-1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `reserve`
  - L：拒绝依据：无放行出处
  - W：出处：AGI §3.3 第 2 步、§3.6「AD-14 出站主体只多要 reserve」，R1-D16。目标为 `scope`，按工作绑定核对
  - S：拒绝依据：宿主以调用方的 Access 预约（AGI §3.3 第 4 步），不以 H 预约
- `publish`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：AGI §3.6：AD-14 不要 publish
  - S：出处：AU-12 `agent-instance-*` 行，AGI §3.3 第 4 步、§3.4，候选 P-1 (a)
- `withdraw`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：AGI §3.6：AD-14 不要 withdraw
  - S：出处：AU-12 `agent-instance-*` 行，AGI §3.3 第 4 步、§3.4，候选 P-1 (a)
- `quiesce`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：AGI §3.6：AD-14 不要 quiesce
  - S：出处：AU-12 `agent-instance-*` 行，AGI §3.3 第 4 步、§3.4，候选 P-1 (a)
- `query`
  - L：拒绝依据：无放行出处
  - W：出处：AD-14 表 `query`（`agentExecutionRecovery.query`）
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `load`
  - L：拒绝依据：无放行出处
  - W：出处：AD-14 表 `inspect` 与 `detach`（`agentExecutionRecovery.load`）
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `reconcile`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：AD-14 的 `recordResult` 待 NP-04（AD:60）
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `detach`
  - L：拒绝依据：无放行出处
  - W：出处：AD-14 表 `detach`，AD「VA-12」
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `record-terminal-observation`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：调用方主体未写明，见候选 P-4 与输入需求 Q-1
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `receive-result`
  - L：拒绝依据：无放行出处
  - W：出处：L-RUN：推送用原受理主体（会话 coordinator 的 W）；L-MODEL：推送前经 ModelHostAuthority.resolve 取主体。只核租户（DP-4 Q-1 三方对齐）
  - S：拒绝依据：AGS:1790 要求推送主体代原租户行事，不用系统主体
- `read-message-handoff`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：直接调用者的主体未写明，见 P-4
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `record-message-handoff`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：直接调用者的主体未写明，见 P-4
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `exclude-message-handoff`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：直接调用者的主体未写明，见 P-4
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `settle`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：长期执行记录适配器的主体未写明，见 P-4
  - S：拒绝依据：矩阵外（AU-12 第 2 步）
- `migrate-cancellation`
  - L：拒绝依据：无放行出处
  - W：拒绝依据：长期执行记录适配器的主体未写明，见 P-4
  - S：拒绝依据：矩阵外（AU-12 第 2 步）

<!-- /policy:agent-notes -->

`receive-result` 的 W 格放行，只核租户。推送用原受理主体，也就是会话 coordinator 的 W。Model 在推送前经 `ModelHostAuthority.resolve` 取这个主体。这是 L-RUN 与 L-MODEL 对 DP-4 的 Q-1 的对齐结果。L 列和 S 列仍然拒绝。

## D 项

下面两格需要新的产品规则。规则定之前，两格按默认拒绝实现，适配器不调用依赖。

<!-- policy:d-items -->

### D-1 `configureAutoArchive` × L

缺哪条产品规则：谁持有「租户设置资格」。SW:187 写「修改须具相应租户设置资格」，SS:611 只写资格名。ID-16 的具名资格只有组织成本账目读取。默认团队方案（IA:39、41）没有写普通成员能否修改本租户的设置。

默认拒绝：操作不在 M2 公开面，自动归档尚未实现，已知限制。

### D-2 `setRelation` × L

缺哪条产品规则：两条。第一，谁持有「会话管理资格」，可以把自己的主会话标记常驻（SW:187）。第二，建立子会话与 handoff 关系的授权由谁定义。SW:175 写「派发与通信的授权及可靠投递归相应业务」，SS:610 只写「关系依据」，相应业务的授权规则还没有正文。

默认拒绝：操作不在 M2 公开面，自动归档尚未实现，已知限制。
<!-- /policy:d-items -->

## 已知限制

- K-1：W 对 Agent 的 `instance`、`execution` 和 `input-entry` 目标只核租户，不核会话。同一租户内，一个会话的 W 能通过授权层访问另一个会话的执行。Agent 自己的目录和执行守卫仍然核对归属。
- K-2：资格只有成员一级。M2 没有按角色细分的会话操作资格。
- K-3：账号退出组织之后，W 的放行格全部变为拒绝。已退出成员的会话，自动归档、空闲取证、恢复和事实接收随之停止。矩阵没有为它们加行，这一项留给后续波。
- K-4：授予表是静态表，主体是进程内对象。进程重启后主体失效。核验靠同一进程的登记集合兑现。
- K-5：一次 `check` 答 `allowed` 之后、提交之前的撤权，不阻止这次提交。下一次核验得到撤权后的结果。
- K-6：`SessionAccessRequest` 没有 `loadScopeRelease` 和 `queryScopeReleaseOperation` 两个变体。矩阵的 `scope-release-load` 与 `scope-release-query` 两行暂时不能经 `sessionAccessCheck` 到达。
- K-7：Agent 经 HITL 修改模式的路径不支持。W 的 `change` 格拒绝。
- K-8：W 列不区分 actor。coordinator 的 W 和 maintainer 的 W 得到同一格。"maintainer 专属操作不能由协调路径发起"这一条，只靠 Session 的调用方类一致性检查保护。
- K-9：`takeover` 对 W 恒放行。取代存活推进者的限制靠 attach 的条件提交。前提是 M2 单进程，每个会话只有一个驱动者。
- K-10：维护授予是部署级的。一个持有者覆盖本部署的全部租户分区。跨分区限制交给 Session SQL 的目录查找。
- K-11：授予表按组件名定位。前提是原始签发者只交给受信持有者。装配把签发者交给普通插件时，该插件能签发任何组件名的主体。
- 波 1 的授予表只给 `toolResidencyPrincipal` 和 `agent-host` 写了记录。部署重启扫描主体和作用域恢复维护主体的组件名未定，没有记录。`pending`、`receive` 和 `releasedScopes` 的系统格因此在发行配置里答 `denied grant-missing`。

## 动作准入

`agentActionAdmission` 没有默认放行。M2 没有动作规则来源，没有许可解释器，也没有决定卡解释器。所以 `admit` 对任何输入都答 `unavailable`，不论 `permissions` 是否为空，也不论 `decision` 是否存在。动作准入的规则来源属于波 B。

## 验证

用例在 `tests/rows/authorization/`：

- `adapters.spec.ts`：两个访问检查对真实的 `SessionAccessCheck` 与 `AgentAccessCheck` 契约运行，依赖是核验器和 `tenantStanding` 的测试替身，授权判定用的是 `@omne-harness/authorization` 的参考件。含依赖抛错时的 `unavailable`、原型链键、固定绑定、前置裁定、矩阵请求的形状、本页与源码的逐格核对，以及 `serveOnce` 下的活树用例。
- `policy-golden.spec.ts`、`policy.spec.ts`、`policy.spec-d.ts`：表本身的逐格黄金表、审计和行完整性。
- `grants.spec.ts`：授予表和读口。

这些用例用测试替身代替 `identity` 行的 `tenantStanding` 和入口对象的 `principalVerifier`。真实的持久提供者和真实入口对象的组合属于联调。

## 维护

- 改一个格：改 `session-policy.ts` 或 `agent-policy.ts`，同步黄金表，重新生成本页的表区。
- 新增一个操作：上游枚举多一项时，成员的类型检查变红。补一行，补出处，补黄金表。
- 新增一个系统动作：先在 `@omne-harness/authorization` 的矩阵里加行，再加矩阵格和授予记录。
- 改授予表：改 `grants.ts` 的常量，修订常量随之加一，重新生成本页。
