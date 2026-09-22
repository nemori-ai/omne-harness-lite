# organization-governance 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/organization-governance/verification.md`](../../../../spec/capabilities/organization-governance/verification.md)：
两份形式工件、九条规范场景（S-46～S-52、S-54，另有 S-21 创建键、S-23／S-30 时长两路、S-30 自环、S-53 依据四条无场景号的义务）。本页按本节点的兑现点登记。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| [S-17](../../../../spec/capabilities/organization-governance/v1/contract.md#s-17-同一组织的成员写入序列化) + 至少一位有效超管 | TLC `Membership.tla` + `Membership.cfg` | **已执行两次**，无反例（[bindings](bindings.yaml)）；**它证的是交错语义，不证选中的存储真的兑现了 R-3a** | 提供者那一半：S-48 真并发演练，未开始 |
| [S-32](../../../../spec/capabilities/organization-governance/v1/contract.md#s-32-接受隶属请求) 判环、[S-6](../../../../spec/capabilities/organization-governance/v1/contract.md#s-6-两个变体与四条结构性禁止)／[S-12](../../../../spec/capabilities/organization-governance/v1/contract.md#s-12-上级链与有共同上级) | Alloy 三条 `check` | **已执行**（run-2，三条 UNSAT），**未登记为 formal task，不可进 bindings**；契约 verification 点名的两个变异核对（注释掉判环、改回不含自身）**未做** | 规格工具；本节点的对应义务是判环代码与契约④两半逐字一致的单元测试（未开始） |
| [S-7](../../../../spec/capabilities/organization-governance/v1/contract.md#s-7-上级组织属性) 至多一个上级 | 静态检查：`parent` 单列、无第二条写路径 | 未开始 | 本节点 |
| [S-46](../../../../spec/capabilities/organization-governance/v1/contract.md#s-46-邀约的三种收场) 三收场 + 第四支 | 场景演练，邀请与隶属请求各一遍，②③④同一次比对 `offerNoLongerValid` 逐字相同 | 未开始 | 本节点；同一次执行可同时兑现 offer-expiry S-23／S-24，**各自记结果** |
| [S-47](../../../../spec/capabilities/organization-governance/v1/contract.md#s-47-过期之后接受被拒且没有中间状态) | 演练，可前推 `clock`，无后台清理（本节点本来就不提供） | 未开始 | 本节点 + 装配（可控 `clock`） |
| [S-48](../../../../spec/capabilities/organization-governance/v1/contract.md#s-48-并发移除对方只有先成的一方成立) | **真并发**演练 | 未开始 | 本节点。**这是 R-3a 的唯一实证** |
| [S-39](../../../../spec/capabilities/organization-governance/v1/contract.md#s-39-回来的是同一个租户) 回来的是同一条记录 | 单元测试：解除后再接受邀请，成员关系表行数不变、主键相同、`effective` 翻回；**不进 bindings**——`Membership.tla` 的 `Rejoin` 复用同一个 Actors 元素是建模方式，模型里没有在 S-39 被违反时会失败的断言 | 未开始 | 本节点；「不可达但不销毁」那一半是跨契约场景 S-49 |
| [S-49](../../../../spec/capabilities/organization-governance/v1/contract.md#s-49-解除之后再加入回来的是同一个租户) | 跨契约演练 | 未开始；**受阻**：资产契约尚无 | 本节点 + 资产 owner |
| [S-50](../../../../spec/capabilities/organization-governance/v1/contract.md#s-50-切换只影响此后新建的东西) | 跨契约演练 | 未开始；**受阻**：PF-015 契约尚无 | 本节点 + 会话 owner |
| [S-51](../../../../spec/capabilities/organization-governance/v1/contract.md#s-51-个人组织里没有这个动作) | 演练，发起者是超管 | 未开始 | 本节点 |
| [S-52](../../../../spec/capabilities/organization-governance/v1/contract.md#s-52-成员资格不可用时明确失败) | 故障注入 `storage` 读失败，S-26／S-28／S-37 各观察 `unavailable` | 未开始 | 本节点 |
| [S-54](../../../../spec/capabilities/organization-governance/v1/contract.md#s-54-清除只对未激活账号成立) 八支 | 演练 + 构造态 + 故障注入；⑥⑦挨着跑；④⑦要直接构造存储状态 | 未开始 | 本节点 + account-identity（⑥要真跑 S-38）。**③是本节点自己那一半防御的唯一证据** |
| [S-53](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 依据 | 成功与幂等成功都拿到与 AccountId 绑定的依据；失败与 `unavailable` **不签发** | 未开始 | 本节点；签名方案下「绑定」= `verify` 用另一个 AccountId 核不过 |
| [S-21](../../../../spec/capabilities/organization-governance/v1/contract.md#s-21-创建团队组织) 创建键五支 + 注入 | 演练 | 未开始 | 本节点 |
| [S-23](../../../../spec/capabilities/organization-governance/v1/contract.md#s-23-发出邀请)／[S-30](../../../../spec/capabilities/organization-governance/v1/contract.md#s-30-发出隶属请求) 时长两路、S-30 自环 | 演练 | 未开始 | 本节点 |
| [S-42 第 4 行](../../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 只由清除链调用 | 结构检查：仓库内解析 `organization-purge` 的包只有 `account-registration`——**同时查 inject 声明与 `ctx.get('organization-purge')` 一类动态解析**；须有一条「在别的包里故意解析就失败」的自测 | 未开始；检查器不存在 | 装配节点；本节点提出形式 |
| 「同一提交」的跨 owner 解释（[design.md](design.md#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)） | 与 account-identity S-43 第 2 支同一次真并发演练，**含两条交错**（激活 vs 清除、创建个人组织 vs 清除）；另一条 R-6 的注入测试：直接构造「组织行指着账号行」时 S-38 被拒、重扫后收敛 | 未开始 | 本节点 + account-identity + account-registration |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| `2026-09-22-formal-tenant-domain-2` · `organization-governance-v1-membership` | `Membership.tla` + `Membership.cfg`（`Actors = {a1,a2}`，`Serialized = TRUE`） | 无反例，退出 0；19 generated · 7 distinct · 穷尽 | [run README](../../../../record/evidence/2026-09-22-formal-tenant-domain-2/README.md) |
| 同 run · `validity-check/`（**非 formal task**） | `Membership_NoSerialization.cfg`（`Serialized = FALSE`） | **按预期**违反 `AtLeastOneSuperAdministrator`，退出 12 | 同上 |
| 同 run · `unregistered-alloy-affiliation/`（**非 formal task**） | `Affiliation.als` 四条命令 | `aNonTrivialTree` SAT（预期）；三条 check UNSAT（预期无反例） | 同上 |

三行都不是本节点的符合性证据：源码不存在，它们检查的是契约的模型。有效性核对那一行证明的是「序列化这条前提是 load-bearing 的」——正是存储要求 R-3a 存在的理由。

## 覆盖缺口

- **首稿的「临界区 + 单调事实」被否定**（architecture-reviewer，2026-09-22）：两条交错——S-14 与 S-53 之间没有共同写入的存储对象，`now` 不参与冲突检测；进程内锁随实例生灭。现行设计改为账号行上的过期事实 + R-6，证据形式见上表倒数第一行，未开始。
- **S-42 右列九行协议给**本版无证据形式，跨进程逐行重开（G-7）。
- **S-36／S-37 校验与读选择之间的单次调用窗口**：校验通过后撤销、再读选择，本次调用仍返回 `TenantId`。契约以「每道准入现读」为口径，本次准入的校验是现读的；记为已知形态，不是违反，跨进程后并入撤销传播时延 δ。
- **G-13 残留清扫**无触发；**G-2** 组织消失分支无触发源，S-46／S-47 覆盖不到，契约禁止预埋事件源。
- **Alloy 两个变异核对未做**，「无反例」尚不能读成「判环起作用」。
- **待核对主张**三条（同 account-identity）。
