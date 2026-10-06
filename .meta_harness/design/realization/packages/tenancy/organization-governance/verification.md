# organization-governance 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/organization-governance/verification.md`](../../../../spec/capabilities/organization-governance/verification.md)：
两份形式工件、九条规范场景（S-46～S-52、S-54，另有 S-21 创建键、S-23／S-30 时长两路、S-30 自环、S-53 依据四条无场景号的义务）。本页按本节点的兑现点登记。
**v2（候选）** 沿用 v1 的形式工件（v2 [S-45](../../../../spec/capabilities/organization-governance/v3/contract.md#s-45-本版选用哪些形式工件)），新增的义务是场景 S-61 与本节点的双版本、迁移、外部依赖三项（下表标「v2」的行）。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-17](../../../../spec/capabilities/organization-governance/v1/contract.md#s-17-同一组织的成员写入序列化) + 至少一位有效超管 | TLC `Membership.tla` + `Membership.cfg` | **已通过**（形式）：run `2026-09-22-formal-tenant-domain-2` 的 `organization-governance-v1-membership` 无反例；2026-09-23 核过模型与配置和当前 `spec/` 逐字节相同，未重跑（[bindings](bindings.yaml)）。**它证的是交错语义，不证选中的存储真的兑现了 R-3a**；测试 run 不承担模型性质 | 提供者那一半：S-48 真并发演练，见下面 S-48 行（run `2026-09-23-tests-tenancy-leg-2` 通过） |
| [S-32](../../../../spec/capabilities/organization-governance/v1/contract.md#s-32-接受隶属请求) 判环、[S-6](../../../../spec/capabilities/organization-governance/v1/contract.md#s-6-两个变体与四条结构性禁止)／[S-12](../../../../spec/capabilities/organization-governance/v1/contract.md#s-12-上级链与有共同上级) | Alloy 三条 `check` | **部分**：Alloy 三条 `check` 在当前冻结文件（`1a72efa2…`）上重跑，三条 UNSAT、`run aNonTrivialTree` SAT（run `2026-09-23-alloy-affiliation`；此前 run-2 的快照差一行注释）——**未登记为 formal task，不可进 bindings**；契约 verification 点名的两个变异核对（注释掉判环、改回不含自身）**未做**。判环代码的单元测试有且通过（run `2026-09-23-tests-tenancy-leg-2`）：`organizations.spec.ts` › `S-32／S-33／S-34 隶属与上级链` › `S-32 判环两半…`、`S-32 判环的「child === newParent」那一半…（Alloy 曾给出的反例）`、`S-32 判环读不到部分链 ⇒ unavailable…` | 规格工具；本节点的对应义务是判环代码与契约④两半逐字一致的单元测试 |
| [S-7](../../../../spec/capabilities/organization-governance/v1/contract.md#s-7-上级组织属性) 至多一个上级 | 静态检查：`parent` 单列、无第二条写路径 | **已通过**（run `2026-09-23-tests-tenancy-leg-2`）：`organizations.spec.ts` › `S-7 至多一个上级：静态检查`（2 条：源码里写 `parent` 的语句只有两条、存储形状恰一列 `parent`）——是测试文件里的源码／存储形状检查，不在 `tools/ts-checks` | 本节点 |
| [S-46](../../../../spec/capabilities/organization-governance/v1/contract.md#s-46-邀约的三种收场) 三收场 + 第四支 | 场景演练，邀请与隶属请求各一遍，②③④同一次比对 `offerNoLongerValid` 逐字相同 | **已通过**（同 run）：`scenarios.spec.ts` › `capability.organization-governance v1 · 规范场景` › `S-46 邀约的三种收场（邀请）…`、`S-46 邀约的三种收场（隶属请求）…` | 本节点；同一次执行可同时兑现 offer-expiry S-23／S-24，**各自记结果** |
| [S-47](../../../../spec/capabilities/organization-governance/v1/contract.md#s-47-过期之后接受被拒且没有中间状态) | 演练，可前推 `clock`，无后台清理（本节点本来就不提供） | **已通过**（同 run）：`scenarios.spec.ts` › … › `S-47 过期之后接受被拒，且没有中间状态…`（包内可前推的时间替身） | 本节点 + 装配（可控 `clock`） |
| [S-48](../../../../spec/capabilities/organization-governance/v1/contract.md#s-48-并发移除对方只有先成的一方成立) | **真并发**演练 | **已通过**（同 run，只在 sqlite 一侧）：`scenarios.spec.ts` › … › `S-48 并发移除／降级对方只有先成的一方成立（真并发：两个装配、两个存储连接、同一库文件）` | 本节点。**这是 R-3a 的唯一实证** |
| [S-39](../../../../spec/capabilities/organization-governance/v1/contract.md#s-39-回来的是同一个租户) 回来的是同一条记录 | 单元测试：解除后再接受邀请，成员关系表行数不变、主键相同、`effective` 翻回；**不进 bindings**——`Membership.tla` 的 `Rejoin` 复用同一个 Actors 元素是建模方式，模型里没有在 S-39 被违反时会失败的断言 | **已通过**（同 run）：`offers.spec.ts` › `S-25 接受邀请` › `S-39 回来的是同一个租户：解除后再邀请并接受 ⇒ 同一行、同一个 TenantId、有效性翻回，角色不继承`。**承担者在 `offers.spec.ts`**——`scenarios.spec.ts` 里 S-49 占位写的「本包那一半见 memberships.spec「S-39」」指错了文件 | 本节点；「不可达但不销毁」那一半是跨契约场景 S-49 |
| [S-49](../../../../spec/capabilities/organization-governance/v1/contract.md#s-49-解除之后再加入回来的是同一个租户) | 跨契约演练 | **跳过**（`scenarios.spec.ts` 占位：跨契约、资产 owner 一侧，本版不做）；**受阻**：资产契约尚无 | 本节点 + 资产 owner |
| [S-50](../../../../spec/capabilities/organization-governance/v1/contract.md#s-50-切换只影响此后新建的东西) | 跨契约演练 | **跳过**（`scenarios.spec.ts` 占位：跨契约，本版不做）；**受阻**：PF-015 契约尚无 | 本节点 + 会话 owner |
| [S-51](../../../../spec/capabilities/organization-governance/v1/contract.md#s-51-个人组织里没有这个动作) | 演练，发起者是超管 | **已通过**（同 run）：`scenarios.spec.ts` › … › `S-51 个人组织里没有这个动作：发起者是超管…` | 本节点 |
| [S-52](../../../../spec/capabilities/organization-governance/v1/contract.md#s-52-成员资格不可用时明确失败) | 故障注入 `storage` 读失败，S-26／S-28／S-37 各观察 `unavailable` | **已通过**（同 run）：`scenarios.spec.ts` › … › `S-52 成员资格不可用时明确失败：S-26／S-28／S-37 都是 unavailable…` | 本节点 |
| [S-54](../../../../spec/capabilities/organization-governance/v1/contract.md#s-54-清除只对未激活账号成立) 八支 | 演练 + 构造态 + 故障注入；⑥⑦挨着跑；④⑦要直接构造存储状态 | **已通过**（同 run）：①～⑤、⑧ `scenarios.spec.ts` › … › `S-54 清除只对未激活账号成立` › `①～⑤、⑧同一次演练对比…`；⑥⑦ `packages/tenancy/account-registration/tests/interleavings.spec.ts` › `og#S-54 ⑥⑦（真实 AI S-38），挨着跑`。本包内 ⑥、⑦ 两个占位**跳过** | 本节点 + account-identity（⑥要真跑 S-38）。**③是本节点自己那一半防御的唯一证据** |
| [S-53](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 依据 | 成功与幂等成功都拿到与 AccountId 绑定的依据；失败与 `unavailable` **不签发** | **已通过**（同 run）：`organizations.spec.ts` › `S-53 清除依据与 ②乙 两支（替身构造…）` › `依据只在 ok 路径产出…`；`scenarios.spec.ts` › … › `S-54 …` › `①～⑤、⑧…` | 本节点；签名方案下「绑定」= `verify` 用另一个 AccountId 核不过 |
| [S-21](../../../../spec/capabilities/organization-governance/v1/contract.md#s-21-创建团队组织) 创建键五支 + 注入 | 演练 | **已通过**（同 run）：`organizations.spec.ts` › `S-21 创建团队组织：创建键的幂等边界`（4 条，含五支同跑与键登记读不到的注入） | 本节点 |
| [S-23](../../../../spec/capabilities/organization-governance/v1/contract.md#s-23-发出邀请)／[S-30](../../../../spec/capabilities/organization-governance/v1/contract.md#s-30-发出隶属请求) 时长两路、S-30 自环 | 演练 | **已通过**（同 run）：`offers.spec.ts` › `S-23／S-30 有效时长两路（同一次对比）`（2 条）；自环 `organizations.spec.ts` › `S-32／S-33／S-34 隶属与上级链` › `S-32 判环两半：…与 S-30 自环同一个值` | 本节点 |
| [S-42 第 4 行](../../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 只由清除链调用 | 结构检查：仓库内解析 `organization-purge` 的包只有 `account-registration`——**同时查 inject 声明与 `ctx.get('organization-purge')` 一类动态解析**；须有一条「在别的包里故意解析就失败」的自测 | **已通过**（同 run）：`tools/ts-checks/tests/consumer-rules.spec.ts` › `og-s42-dynamic-resolve`（3 条，含对真实 OG `plugin.ts` 的变异核对）；`tools/ts-checks/tests/rules.spec.ts` › `restricted-call-sites`；`pnpm run lint:rules` 退出 0；本包 `organizations.spec.ts` › `S-42 第 4 行：S-53 单独一个服务名` | 装配节点；本节点提出形式 |
| S-36／S-37 的登录状态参数是品牌（[design S-36／S-37 行](design.md#操作)；[AI v2 S-30 第 10 行](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)） | **类型测试**（`tests/types.spec-d.ts`）：把 `unknown` 与 `string` 交给 `currentTenant`、`switchCurrentTenant` 的登录状态参数须编译失败（`@ts-expect-error`，去掉即红），交 `LoginStateId` 编译通过；**另一支运行期**：绕过类型送非法表示（空串、首尾空白）⇒ `invalidInput`，不是 `loginStateNotValid`、不是 `unavailable`，且本节点没有读存储——钉住「S-31 解析交给 AI S-17、本节点按 S-4 第三行映射」 | **已通过**（同 run）：类型 `types.spec-d.ts` › `E-4：S-36／S-37 的登录状态参数是 LoginStateId 品牌…`；运行期 `memberships.spec.ts` › `S-36／S-37 当前租户身份` › `E-4 运行期那一支：绕过类型送非法表示 ⇒ invalidInput（不是 loginStateNotValid／unavailable），且本节点没有读存储` | 本节点。类型那一支失守是静默的：入口层把线上的串直接交进来，每一步都返回成功 |
| **v2** [S-61](../../../../spec/capabilities/organization-governance/v3/contract.md#s-61-两个时刻随写入写下按规则改写由三个读面带出) 两个时刻 | 两段演练（成员关系、隶属），每步之后经 v2 三个读面各读一次；两支故障注入（时刻读不到 ⇒ `unavailable`）；「严格更晚」在同一时钟分辨率内连做 | **未开始**（源码未改）；「严格更晚」一支受阻于 V2-2 | 本节点 ＋ `infra/clock` |
| **v2** §十三 双版本 | 同一库、同一实例：经 v1 服务名读存量记录 ⇒ v1 形状、不因时刻缺失而 `unavailable`；经 v2 服务名读同一记录 ⇒ `unavailable`；一次写之后两版读面都看得见 v1 承诺的效果 | 未开始 | 本节点 |
| **v2** 迁移片段 | 在带 v1 数据的库上跑合成序列：新片段追加在末尾、登记序列仍是前缀、两列为空、再跑一遍不重复加列 | 未开始 | 本节点 ＋ tenancy-host |
| **v2** 外部依赖 X-1～X-3 | 资产提供者的交错演练（它的 verification D-4、D-8、D-9）；`./tx-reads` 的导入限定规则 ＋ 自测（V2-4） | 未开始 | 本节点 ＋ asset-governance ＋ `tools/ts-checks` |
| 「同一提交」的跨 owner 解释（[design.md](design.md#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)） | 与 account-identity S-43 第 2 支同一次真并发演练，**含两条交错**（激活 vs 清除、创建个人组织 vs 清除）；另一条 R-6 的注入测试：直接构造「组织行指着账号行」时 S-38 被拒、重扫后收敛 | **部分**（同 run）：真并发两条交错 `packages/tenancy/account-registration/tests/interleavings.spec.ts` › `ai#S-43 第 2 支 × ar 同一次演练…`（4 条，sqlite），pg 一侧 `apps/tenancy-host/tests/pg.spec.ts` › `pg 首跑 · 交错 I-12（…）`（3 条）；R-6 注入的插入方向 `organizations.spec.ts` › `S-20 创建个人组织` › `R-6：读账号之后、写入之前账号行被删 ⇒ 引用约束拒绝插入…`。义务点名的「直接构造『组织行指着账号行』时 S-38 被拒、重扫后收敛」没有逐字同名的用例——`account-registration/tests/purge.spec.ts` › `S-34 清除链…` 里有相关的几条 | 本节点 + account-identity + account-registration |

**修订波（2026-09-25 公开面）**：design v2 段新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），写明装配不变、本包没有能力判定函数、`./tx-reads` 属存储级入口不属函数面；上表证据义务与下面的运行都不变，不新增义务。

## 覆盖缺口

按上面这次 run 的对应清单，本节点还缺的证据：

- **S-49、S-50 跳过**：跨契约，资产契约与 PF-015 会话契约都还没有；本版不做。受阻消费者：资产 owner、会话 owner。
- **Alloy 两个变异核对未做**（注释掉判环、改回不含自身），「无反例」尚不能读成「判环起作用」；Alloy 也仍未登记为 formal task（`alloy exec` 的退出码与断言结果无关）。owner：规格工具（`tooling/`）。
- **「直接构造『组织行指着账号行』时 S-38 被拒、重扫后收敛」**没有逐字同名的用例（相关的在 `account-registration` 的 `purge.spec.ts`）。owner：本节点 + account-registration。
- **本包内 S-54 ⑥⑦ 两个占位仍是跳过**，承担者在 `account-registration`；S-49 占位里「本包那一半见 memberships.spec「S-39」」指错了文件（承担者在 `offers.spec.ts`）——两处改占位注释归本包 owner。

其余不在本 run 证据范围内的：

- **首稿的「临界区 + 单调事实」被否定**（architecture-reviewer，2026-09-22）：两条交错——S-14 与 S-53 之间没有共同写入的存储对象，`now` 不参与冲突检测；进程内锁随实例生灭。现行设计改为账号行上的过期事实 + R-6，证据见上表「同一提交」那一行（部分）。
- **S-42 右列九行协议给**本版无证据形式，跨进程逐行重开（G-7）。
- **S-36／S-37 校验与读选择之间的单次调用窗口**：校验通过后撤销、再读选择，本次调用仍返回 `TenantId`。契约以「每道准入现读」为口径，本次准入的校验是现读的；记为已知形态，不是违反，跨进程后并入撤销传播时延 δ。
- **G-13 残留清扫**无触发；**G-2** 组织消失分支无触发源，S-46／S-47 覆盖不到，契约禁止预埋事件源。
- **待核对主张**三条（同 account-identity）。

**v2（候选，尚未实现）还缺的**：

- **全部 v2 实现证据缺席**：上表四条 v2 行都未开始；`bindings.yaml` 里三条 v2 绑定证的是沿用的 v1 模型（S-17 那一格），**模型里没有两个时刻**，对它们什么也没说。
- **「先后两次串行提交的时刻不相等」**受阻于 `infra/clock` 的 C-15（V2-2，D-060 §八 M58）；在它落地之前 S-61「严格更晚」一支跑不出绿，标「**有前提：C-15**」（C-15 已按 D-060 §八 N-34 排为实施程前置任务，落地后这一支是通过条件）。
- **存量记录不补时刻**（V2-3，D-060 §八 N-19 已接受）：带 v1 数据的库上 v2 读面与资产流转判定的 `unavailable` 是预期结果，不是缺陷；半径是被分享方整个组织的快照（M61）。
- **v2 两个服务名本版无人 inject**：v2 读面的唯一证据是 S-61（D-060 §八 M59）。
- `./tx-reads` 的导入限定与钉版本的静态核对都没有规则（V2-4、V2-5）。
