# asset-model 验证与证据

契约侧的证据义务权威在 [`spec/data/asset-model/verification.md`](../../../../spec/data/asset-model/verification.md#证据义务)（V-1～V-7、SC-1～SC-6）。
本页只登记**落在本节点上的那一部分**；写路径、存储与读面上的义务归资产治理节点。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～14 节逐行（含变体行）过包内校验，比对「Schema」一列；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 拒绝值的具名与次序 | 每个拒绝行，`judgeAssetValue` 给出的值与「拒绝值」一列逐字相同；第 13 节十四行专验次序；嵌着的正文值原名进次序 | 未开始；嵌着的那一半要六个正文包的端口实现 | 本节点 |
| V-3 Schema 管不到的约束（examples 第 14 节） | 版本编号连续、`item` 不重复、作者与所有者同属一个组织、正文名与 `capability.name` 一致等**接收边界能判的**逐行得 `malformed` 或具名值 | 未开始 | 本节点只闭合接收边界能判的那几行；「持有与记录一致」「`organization` 支外层确有同一份持有」这类要看存储的行归资产治理 |
| V-4 规范场景 S-29～S-35 | 每条一正一反；真实接收边界、真实存储 | 未开始 | S-29（名字里的斜杠）、S-30、S-31、S-32 的形状面本节点可做单元级演练；S-33～S-35 要存储，归资产治理 |
| S-4 例外支、S-19 `carrier` 支（本节点的导法） | `carrierRecordId` 对不同的 `(WorkspaceKey, capability)` 给不同的号、与 `generateOpaqueIdentifier()` 的输出不相交、同一对恒得同一个号；`contentFingerprint` 对成员次序不同的同一内容给同一指纹 | 未开始 | 本节点 |
| S-24 第 6 条（成员名重复） | `parseWorkspaceManifestText` 对含重复成员名的清单文本得 `malformed`，对 `JSON.parse` 能静默接受的那种输入同样拒 | 未开始 | 本节点；读入方用不用它见 design [AM-4](design.md#实施缺口与消费者影响) |
| 端口按类别判别（M51） | 类型测试：把一类实现交到另一类键下的那一行标 `@ts-expect-error`，类型检查通过即证那一行确实报错（判别被放宽时这条测试失败）；缺一类的构造抛出另有一条运行期用例 | 未开始 | 本节点 |
| V-5 消费者路径走查 CS-1～CS-8 | 结构化走查 | 未开始 | 本节点与资产治理、求值、流转节点共同走查 |
| V-7 中的 SC-6 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |

**不在本节点**：V-6（跨进程，本版装配下无法演练）；SC-1～SC-5（存储写路径与读面，归资产治理与流转）。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面、写明 `BodyContracts` 端口是可替换构件，不新增语义，上表证据义务不变；AM-6 改指接口契约 `capability.credential-custodian/v1`。这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **嵌着的正文拒绝值要端口实现才测得了**：V-2 的那一半与六个正文包同时落地才闭合。owner：本节点与六个正文包。
- **空白码点集合**（AM-1，实现期事项）：identity-values 补导出之前，S-2 第 2 条的测试只能对着一份自抄的集合跑——那样的测试证不了「与 identity-values 同一集合」。owner：identity-values 节点落包时。

## 独立评审

2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行）：本节点建议 1（含两点），无阻断、无应修；主线据此裁定 [D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M51（批的结论见同节 N-28）。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| 建议 3（前半） | 端口 `BodyContracts` 的类型形状未写；若不按类别判别，把一类实现交到另一类键下能编译、运行时只给错误裁决，没有会失败的检查 | 按 M51：端口类型按类别判别，错类编译期失败 | design.md 端口比较表「错类的实现」一行、依赖表那一行；本页新加一行 |
| 建议 3（后半） | `BodyContracts` 有三处组合根（资产治理、据点注册表、asset-evaluation），分叉时没有检查失败 | 按 M51：只留一处——asset-evaluation 导出 `defaultBodyContracts`，治理与注册表 import 它；不另写多处一致性测试 | design.md 本方弱点、依赖表、AM-5；asset-evaluation「实现路径」 |
