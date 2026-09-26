# 八份 v3 候选起草交接

状态：candidate，未接受、未发布、未冻结、未实施。本轮只写八个新目录及本主题四份交接文件；正式 registry、源 v2、产品与词条保持原样。

## 交付清单

源提交 `3a226ab6705dad8a49762f76f37f405e00580eb4`，分支 `panqiwei/core-delivery-spec-reconciliation`。源32项摘要全部与 [固定输入](../../evidence/2026-09-26-core-spec-reconciliation/inputs.json) 一致。精确源/候选摘要和完整逐资源 unified diff 见 [candidate-diff.json](candidate-diff.json)。

| candidate 包（设计根相对路径） | 规范资源数 | S条款数 |
|---|---:|---:|
| `spec/data/content-blocks/v3` | 3 | 34 |
| `spec/data/model-response/v3` | 3 | 35 |
| `spec/data/tool-definition/v3` | 3 | 31 |
| `spec/data/asset-model/v3` | 3 | 36 |
| `spec/data/loop-extension/v3` | 3 | 41 |
| `spec/data/messages/v3` | 5 | 50 |
| `spec/capabilities/asset-evaluation/v3` | 4 | 44 |
| `spec/capabilities/stream-assembly/v3` | 8 | 39 |

六份 data 都有 contract、Schema、examples；Messages 另有 Alloy 与 formal 入口。SA 完整八资源为 contract、examples、formal/README、Assembly.tla 与四份 cfg；AE 为 contract、examples、formal/README、Evaluation.als。SA/AE 不发布 Schema。已有全部条款号保留，SA 五操作和 AE 两操作均保留九项；data 不虚构操作。

[candidate-registry-patch.json](candidate-registry-patch.json) 提议 append 8 条 candidate catalog、37 条带 clauses 依赖、334 条 reviewed:false cover 与 1 个正配置 formal task；不新增编号族，记录原有 S-/G-/场景编号族复用。三个否定配置只列 validity-check，两个 Alloy 模型按现行判读口径不登记任务；acceptance、frozen、lineage 均无修改提案。**这些已写入 patch，尚未应用到正式 registry。**

[consumer-impact.json](consumer-impact.json) 列八个 core 提供者的待采用动作，以及24个沿当前 catalog 消费图受影响但未迁移的外部消费者。TER、MRR、tool-admission、loop-extension-runner 仍采用2；接受或推荐3不自动迁移它们。公开旧Schema资源原字节/$id保留规划归主线；本次没有旧行为兼容层。阶段仍限 core 和两项 util，Connector2 定义保留在 AM 完整Schema，Connector真实提供者继续延期。

## 承诺、裁定与推导

主线 D-068 沿 D-060 N32 裁定：完整未解析调用允许保留坏模型名字，正常参数继续要求 ModelToolName；不可执行、不重解析、不改名。CB3 拥有该分支表示，Messages3/MR3/Loop3 显式采用它；Loop 的 before_action 守卫仍不派发未解析调用。TD3 按既有先CB表示、后禁止调用的次序，对合法坏名未解析返回报 result_call_in_content，正常参数坏名仍 malformed。SA3 两条例子的表示层错误在索引错误之前；解析点、五操作、trim和快照行为不改。AM3/AE3 仅采用新正文，不改变资产域、四步、C条件和已知缺口。

起草推导只展开可机械检查的表达：CB共用tool是非空string，ModelToolName约束放在arguments分支，arguments属性指针保留；二十九个窄场景覆盖该分支及消费路径；登记新增直接消费CB S-12与Messages S-31的条款。理由分别是两参数分支的既定互斥、共享形状的采用、以及正文新增明确引用。未新增操作、失败值、具名政策或统一语言词条。Schema的通过/拒绝与契约失败值/运行时派发许可在场景中分列。

## 本轮变化的影响与证据义务

本报告承接本轮每包变化影响；原版本外 verification 不在写权限内，未改，不把其旧运行当v3结果。原有证据义务继续适用；以下本轮增量之外的提供者、运行时与持久化义务均未开始本轮验证。

| 包 | 本轮增量证据义务 | 未开始/未运行范围 |
|---|---|---|
| CB | 两分支正反实例、ModelToolName原字节、其余断言不变 | 真实解析次数、日志写入与执行责任由SA/运行时兑现 |
| Messages | AssistantMessage坏名未解析合法、正常参数坏名拒绝、共用副本 | 日志配对/唯一性；Alloy本轮未运行 |
| MR | reply/delivered采用闭包；六处断言副本；路由/错误优先级不改 | 运行时响应写入、晚到账与栅栏，均非本轮实现证据 |
| Loop | 请求/完成reply主体闭包；tools名字仍严格；Schema通过不授予before_action许可 | runner真实派发守卫未运行 |
| TD | 两个返回位置各两个反例，按S-26给同一拒绝值；ModelToolName不变 | 拒绝值优先级实际提供者重跑未开始；Schema只检查拒绝，不证明值名 |
| AM | 全Schema依赖与Connector2资源存在；其余断言不变 | 当前八类领域规则不重定；Connector提供者仍在阶段外 |
| SA | 第25/26行与P4映射一致；全部五操作九项；5个执行文件原字节 | TLC与三个validity-check本轮未运行；坏名与表示优先级不在原模型 |
| AE | 精确标准正文采用、两操作九项、原模型字节 | Alloy本轮未运行；四步真实提供者验证未开始 |

未给形式工具链路径，本轮未运行 TLC/Alloy，不记通过。formal-task提案明列常量、无公平性、死锁开关与单流串行假设；只有能失败的 P-1/P-7 断言作证据，其余按构造条目不宣称覆盖。源模型的旧版本注释保留用于原字节核对，v3采用由目录和formal入口说明，不重标旧日志。

## 实际检查

本次工具链为本spoke `.venv/bin/python`（Python 3.12）与本检出的 `tooling/src/check_design.py`；没有安装依赖、没有运行产品实现测试。

- `check_design.py --root .meta_harness/design --formal registered --gate internal`：PASS。原始输出 `tmp/core-spec-reconciliation/check-formal-registry-final.log`（检查输出37行；末行 PASS）。正式清单尚无候选，故此项不声称验证了候选登记。
- 同一检查器指向 `tmp/core-spec-reconciliation/synthetic/.meta_harness/design`：PASS。这个隔离副本只追加 candidate patch 的四份登记；原始输出 `check-synthetic-registry.log`，包含 `stream-assembly-v3-assembly: registered; execution was not requested`。此项检查候选登记/依赖/资源/锚点，**不接受、冻结或执行形式工具**。
- `tmp/core-spec-reconciliation/verify.py`：本轮定向检查的实际输出见 `candidate-checks-final.log`，机器明细 `candidate-checks.json`；六Schema元校验、333处引用解析、29个窄规范实例、MR六处断言副本、两个ModelToolName完整对象字节、六Schema无关断言、32源摘要、七执行文件字节、310条款编号、七操作九项、cover与消费clauses均核对。只验证形状与书面承诺一致，不冒称拒绝优先级已被实现兑现。
- 最初设计检查因报告文件尚未生成报26处断链；最初窄实例检查发现新增Loop完成主体漏usage/cost，已按其原required补齐。两份原失败日志保留：`check-formal-registry.log`、`candidate-checks.log`；最终结果另存，没有覆盖失败输出。

上述临时原始输出均在本spoke `tmp/core-spec-reconciliation/`，主线签收时须一起保留；本报告和差异文件保存检查结论与输入范围，不能用它们冒充原始输出。

## 报给主线

- 需求rev前置核对曾发现源2引用旧rev；主线已明确限定采用 PF-005 5→6、PF-012 14→15、PF-013 12→13，本次候选依据已更新，历史修订叙述保留原rev。逐topic差异、owner与不扩张的范围在 candidate-diff/consumer-impact 的 requirement_revision_adoption。PF-005的hooks宿主许可与环境变量名单归外部owner；PF-012保留已发响应与迟到账但核心不拥有栅栏；PF-013只收窄UI验收适用。未发现本批正文与这些限定的新反例。
- 表示缺口CB G-10在候选中闭合，**整条执行链没有闭合声明**；外部运行时仍pin2，主线应将其迁移保持为affected，不可因core采用3而改写冻结2。
- AR2两条禁调用路径的完整拒绝等同性反例、公开旧Schema资源支持、采用矩阵与提供者映射均归主线后续签收。本轮没有修改它们。
- 源2 catalog遗漏两处实质消费：AE S-4/S-23使用Loop S-40，Messages S-37使用CB S-24。主线批准仅在新3 patch补登记；candidate-diff 保留此事实，源2不改。identity S-33的类比与TD对AM S-27的否定式对照继续不登。
- 无新增产品问题、无新词条、无新增失败政策。原有缺口继续由下列owner承担；本报告不是接受。

## 继承的已知缺口

本轮没有自行裁决原缺口；下面列未标明闭合的G编号与原owner/闭合责任，细节以各候选「已知缺口」原表为准。CB G-10的表示闭合另列上文，实际迁移归外部owner。

| 契约 | 缺口 | owner/闭合责任（沿原表） |
|---|---|---|
| `data.content-blocks/3` | G-1 | **PF-006 的 owner** |
| `data.content-blocks/3` | G-4 | **realization** |
| `data.model-response/3` | G-3 | loop 那一程（主线） |
| `data.model-response/3` | G-4 | 产品负责人（PF-002 设置）＋ 主线（哪份契约承载这项设置） |
| `data.model-response/3` | G-5 | `capability.model-request-runtime` |
| `data.model-response/3` | G-8 | 模型请求运行时的提供者设计 ＋ `capability.model-request-runtime` |
| `data.model-response/3` | G-9 | PF-010 组装的能力 ＋ `capability.model-request-runtime` |
| `data.model-response/3` | G-10 | 模型请求运行时的提供者设计 |
| `data.tool-definition/3` | G-1 | **主线**（规格层） |
| `data.tool-definition/3` | G-2 | **PF-005 的 owner** 与执行运行时 |
| `data.tool-definition/3` | G-5 | **执行运行时契约**，产品面问 **PF-005 / PF-006 的 owner** |
| `data.tool-definition/3` | G-9 | **主线**与**执行运行时契约** |
| `data.tool-definition/3` | G-10 | **主线**（与 `data.content-blocks`、`data.messages` 对齐） |
| `data.tool-definition/3` | G-11 | **主线**，产品面问 **PF-006 的 owner** |
| `data.tool-definition/3` | G-12 | **模型请求运行时一侧**与研究维护者 |
| `data.tool-definition/3` | G-13 | **PF-006 的 owner**（存储待裁） |
| `data.tool-definition/3` | G-14 | **主线**；需要时发布下一版本 |
| `data.tool-definition/3` | G-16 | **提供者设计**（登记上限的值与判法；需要跨实现一致时由主线定一份共同的下限） |
| `data.asset-model/3` | G-1 | **PF-002 的 owner** |
| `data.asset-model/3` | G-6 | **PF-004 的 owner** 与其契约 |
| `data.asset-model/3` | G-9 | **PF-002 的 owner**（成员与 Rules 的产品含义）；随后由主线定形状 |
| `data.asset-model/3` | G-12 | **`capability.asset-evaluation`** 定求值；是否要告知配值方归 **PF-002 的 owner** |
| `data.asset-model/3` | G-15 | **主线 ＋ `data.connector`**（D-060 §五 K44）：专项讨论后 connector 收口（留哪一项、另一项怎样对应），本条与那份契约的 G-4 同时关 |
| `data.loop-extension/3` | G-1 | PF-010 压缩那一侧的能力 |
| `data.loop-extension/3` | G-4 | 主线（Run 相关条目与取消请求的形状，PF-012 §6.16 / PF-000） |
| `data.loop-extension/3` | G-5 | 词表 owner ＋ `data.tool-definition` |
| `data.loop-extension/3` | G-6 | PF-008 卡片契约（未起草） |
| `data.loop-extension/3` | G-15 | 主线 ＋ PF-010 |
| `data.loop-extension/3` | G-16 | 主线（与 `data.messages` 对齐） |
| `data.loop-extension/3` | G-18 | **主线**（规格层；闭合条件：给声明加一个自定义设置项的成员并补进推出规则，或确认本版拓展件不带自定义设置、PF-002 那一句只指系统自带件的能力契约自带的设置） |
| `data.messages/3` | G-1 | **realization** |
| `data.messages/3` | G-2 | **主线**（loop 与会话那一程） |
| `data.messages/3` | G-5 | **PF-008 的 owner**（卡片契约未起草） |
| `data.messages/3` | G-6 | **PF-015 的 owner**（runtime context 契约未起草） |
| `data.messages/3` | G-7 | **PF-014 的 owner**（§9.1） |
| `data.messages/3` | G-11 | **PF-009 的 owner**（确认读法）；`extension` 那一支要不要结构化的前值与现值，**主线** |
| `data.messages/3` | G-3 | S-9、S-37 |
| `data.messages/3` | G-4 | S-21、S-49 |
| `data.messages/3` | G-8 | S-20 |
| `data.messages/3` | G-10 | S-26、S-22 |
| `data.messages/3` | G-12 | S-31 |
| `data.messages/3` | G-13 | 设计依据 |
| `data.messages/3` | G-9 | S-7、S-6、S-29 ④（删去）、S-32 ⑦ |
| `capability.asset-evaluation/3` | G-3 | PF-004 的契约（Agent Definition 正文） |
| `capability.asset-evaluation/3` | G-4 | 主线（读入面加输入「外层对这些能力标识的持有」，或改清单形状） |
| `capability.asset-evaluation/3` | G-6 | 各类正文契约（解析） |
| `capability.asset-evaluation/3` | G-7 | PF-015 / PF-016 的 owner |
| `capability.asset-evaluation/3` | G-8 | PF-002 的 owner |
| `capability.asset-evaluation/3` | G-9 | PF-007 / PF-002 的 owner；`capability.asset-governance`（若在写入面挡） |
| `capability.asset-evaluation/3` | G-14 | 架构设计（本版单机不阻断） |
| `capability.asset-evaluation/3` | G-18 | PF-006 的 owner |
| `capability.asset-evaluation/3` | G-19 | 主线（`data.asset-model` 的表示 ＋ `capability.asset-governance` 的写面） |
| `capability.asset-evaluation/3` | G-21 | PF-004 的契约（Agent Definition 正文）；`data.asset-model`（plugin） |
