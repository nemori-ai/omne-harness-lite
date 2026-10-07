# 验证义务与方法

本页维护节点验证义务、责任与方法限制，不维护执行台账。规范与采用版本从契约及本节点 design 读取；实际实现从成员入口读取。结果、配置和反例留工作树 tmp。下列义务列出不表示实现、检查或接受完成，未决语义按原 owner 接续。

契约义务归 [organization-governance verification](../../../../spec/capabilities/organization-governance/verification.md)。成员序列化模型、组织结构模型及后继版本时刻性质分别判读，不把沿用的 v1 模型当成新时刻性质。

## 证据义务

| 来源条款 | 需要什么证据 | owner 与闭合条件 |
|---|---|---|
| [S-17](../../../../spec/capabilities/organization-governance/v1/contract.md#s-17-同一组织的成员写入序列化) + 至少一位有效超管 | TLC `Membership.tla` + `Membership.cfg` | 提供者那一半：S-48 真并发演练，见下面 S-48 行 |
| [S-32](../../../../spec/capabilities/organization-governance/v1/contract.md#s-32-接受隶属请求) 判环、[S-6](../../../../spec/capabilities/organization-governance/v1/contract.md#s-6-两个变体与四条结构性禁止)／[S-12](../../../../spec/capabilities/organization-governance/v1/contract.md#s-12-上级链与有共同上级) | Alloy 三条 `check` | 规格工具；本节点的对应义务是判环代码与契约④两半逐字一致的单元测试 |
| [S-7](../../../../spec/capabilities/organization-governance/v1/contract.md#s-7-上级组织属性) 至多一个上级 | 静态检查：`parent` 单列、无第二条写路径 | 本节点 |
| [S-46](../../../../spec/capabilities/organization-governance/v1/contract.md#s-46-邀约的三种收场) 三收场 + 第四支 | 场景演练，邀请与隶属请求各一遍，②③④同一次比对 `offerNoLongerValid` 逐字相同 | 本节点；同一次执行可同时兑现 offer-expiry S-23／S-24，**各自记结果** |
| [S-47](../../../../spec/capabilities/organization-governance/v1/contract.md#s-47-过期之后接受被拒且没有中间状态) | 演练，可前推 `clock`，无后台清理（本节点本来就不提供） | 本节点 + 装配（可控 `clock`） |
| [S-48](../../../../spec/capabilities/organization-governance/v1/contract.md#s-48-并发移除对方只有先成的一方成立) | **真并发**演练 | 本节点。R-3a 须由该真并发方法在实际提供者上验证 |
| [S-39](../../../../spec/capabilities/organization-governance/v1/contract.md#s-39-回来的是同一个租户) 回来的是同一条记录 | 单元测试：解除后再接受邀请，成员关系表行数不变、主键相同、`effective` 翻回；**不进 bindings**——`Membership.tla` 的 `Rejoin` 复用同一个 Actors 元素是建模方式，模型里没有在 S-39 被违反时会失败的断言 | 本节点；「不可达但不销毁」那一半是跨契约场景 S-49 |
| [S-49](../../../../spec/capabilities/organization-governance/v1/contract.md#s-49-解除之后再加入回来的是同一个租户) | 跨契约演练 | 本节点 + 资产 owner |
| [S-50](../../../../spec/capabilities/organization-governance/v1/contract.md#s-50-切换只影响此后新建的东西) | 跨契约演练 | 本节点 + 会话 owner |
| [S-51](../../../../spec/capabilities/organization-governance/v1/contract.md#s-51-个人组织里没有这个动作) | 演练，发起者是超管 | 本节点 |
| [S-52](../../../../spec/capabilities/organization-governance/v1/contract.md#s-52-成员资格不可用时明确失败) | 故障注入 `storage` 读失败，S-26／S-28／S-37 各观察 `unavailable` | 本节点 |
| [S-54](../../../../spec/capabilities/organization-governance/v1/contract.md#s-54-清除只对未激活账号成立) 八支 | 演练 + 构造态 + 故障注入；⑥⑦挨着跑；④⑦要直接构造存储状态 | 本节点 + account-identity（⑥要真跑 S-38）。**③是本节点自己那一半防御的唯一证据** |
| [S-53](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 依据 | 成功与幂等成功都拿到与 AccountId 绑定的依据；失败与 `unavailable` **不签发** | 本节点；签名方案下「绑定」= `verify` 用另一个 AccountId 核不过 |
| [S-21](../../../../spec/capabilities/organization-governance/v1/contract.md#s-21-创建团队组织) 创建键五支 + 注入 | 演练 | 本节点 |
| [S-23](../../../../spec/capabilities/organization-governance/v1/contract.md#s-23-发出邀请)／[S-30](../../../../spec/capabilities/organization-governance/v1/contract.md#s-30-发出隶属请求) 时长两路、S-30 自环 | 演练 | 本节点 |
| [S-42 第 4 行](../../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证) 只由清除链调用 | 结构检查：仓库内解析 `organization-purge` 的包只有 `account-registration`——**同时查 inject 声明与 `ctx.get('organization-purge')` 一类动态解析**；须有一条「在别的包里故意解析就失败」的自测 | 装配节点；本节点提出形式 |
| S-36／S-37 的登录状态参数是品牌（[design S-36／S-37 行](design.md#操作)；[AI v2 S-30 第 10 行](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)） | **类型测试**（`tests/types.spec-d.ts`）：把 `unknown` 与 `string` 交给 `currentTenant`、`switchCurrentTenant` 的登录状态参数须编译失败（`@ts-expect-error`，去掉即红），交 `LoginStateId` 编译通过；**另一支运行期**：绕过类型送非法表示（空串、首尾空白）⇒ `invalidInput`，不是 `loginStateNotValid`、不是 `unavailable`，且本节点没有读存储——钉住「S-31 解析交给 AI S-17、本节点按 S-4 第三行映射」 | 本节点。类型那一支失守是静默的：入口层把线上的串直接交进来，每一步都返回成功 |
| **后继版本** [S-61](../../../../spec/capabilities/organization-governance/v3/contract.md#s-61-两个时刻随写入写下按规则改写由三个读面带出) 两个时刻 | 两段演练（成员关系、隶属），每步之后经 v2 三个读面各读一次；两支故障注入（时刻读不到 ⇒ `unavailable`）；「严格更晚」在同一时钟分辨率内连做 | 本节点 ＋ `infra/clock` |
| **后继版本** §十三 双版本 | 同一库、同一实例：经 v1 服务名读存量记录 ⇒ v1 形状、不因时刻缺失而 `unavailable`；经 v2 服务名读同一记录 ⇒ `unavailable`；一次写之后两版读面都看得见 v1 承诺的效果 | 本节点 |
| **后继版本** 迁移片段 | 在带 v1 数据的库上跑合成序列：新片段追加在末尾、登记序列仍是前缀、两列为空、再跑一遍不重复加列 | 本节点 ＋ tenancy-host |
| **后继版本** 外部依赖 X-1～X-3 | 资产提供者的交错演练（它的 verification D-4、D-8、D-9）；`./tx-reads` 的导入限定规则 ＋ 自测（V2-4） | 本节点 ＋ asset-governance ＋ `tools/ts-checks` |
| 「同一提交」的跨 owner 解释（[design.md](design.md#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)） | 与 account-identity S-43 第 2 支同一次真并发演练，**含两条交错**（激活 vs 清除、创建个人组织 vs 清除）；另一条 R-6 的注入测试：直接构造「组织行指着账号行」时 S-38 被拒、重扫后收敛 | 本节点 + account-identity + account-registration |

## 覆盖缺口

- Alloy 判环、含自身与同树判据保留负控；真实判环代码须覆盖 child===newParent 与部分链读失败。TLC 不能证明实际存储 R-3a，S-48 须两个装配/独立连接在同库真并发。
- S-49 资产不可达但不销毁与 S-50 会话创建捕获身份均为跨 owner 组合，须资产和会话 owner 的实际消费者，包内成员行恢复不能代替。
- 同提交保证由账号行单调过期事实与组织引用约束共同兑现。真并发核激活/清除、创建个人组织/清除；直接构造引用组织行后 S-38 删除被拒，并重扫收敛，不能只测反向插入失败。
- S-42 九行协议保证跨进程逐行验证。S-36/S-37 的准入现读与后续选择间撤销按当前契约窗口解释，不能从单调用结果宣称撤销传播无延迟。
- 残留清扫 G-13、组织消失 G-2 无触发源时不得预埋事件源；上游 API、私钥边界与事务前提按 design 当前缺口接续。
- 后继 S-61 两时刻在同一时钟分辨率内必须严格更晚，前提归 clock C-15；存量记录不补时刻，其新读面 unavailable 是规范结果，按分享半径的整个组织快照验证。
- 双版本读形状、迁移末尾追加且幂等、资产交错 X-1～X-3、tx-reads 的限定导入与版本静态检查分别有 owner，不能由旧模型或无消费者的服务声明代替。
