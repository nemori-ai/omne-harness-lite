# assembly-manifest-store

## 当前集成入口（H3）

实际包已有 MF4 六操作实现；本轮将纯工厂与 Cordis 提供者分面，采用正式 Service、具名资源注入和真实排空观察。当前集成承诺归[提供者薄规格](../../../../../../packages/assets/assembly-manifest-store/SPEC.md)与[公共定义](../../../../../../packages/core/assembly-manifest/SPEC.md)，验证归[包内入口](../../../../../../packages/assets/assembly-manifest-store/verification/README.md)。下文“尚未建包”等表述保留原 v2/v3 当时范围，不代表当前源码状态；旧集成图不再作为本次已迁绑定的现行依据。

MF4 业务仍按 D-079及其精确来源消费，未迁的模型、授权、PG 和完整生产链义务继续有效。绑定整改与组件验证不提升为整个模型域或产品接受。


> 历史路径提示：本页所称 `apps/model-request-acceptance`／`model-request-acceptance` 是 D-076 采用时的技术验收装配坐标；当前已退出 `apps/` 映射。现行归属与剩余责任以[实现映射入口](../../../README.md)为准。


## v3 候选增量（2026-09-27）

- **语义接受：无。** 本节点 v3 增量仍为候选；精确消费 [`capability.assembly-manifest/v3`](../../../../spec/capabilities/assembly-manifest/v3/contract.md)、`capability.asset-evaluation/v4` S-47 与生产者 `capability.asset-registry/v3`。依赖接受状态及采用记录以 [registry catalog](../../../../registry/catalog.json) 为准；下列 v2 接受事实不延伸到新读面。
- **可实施范围：候选。** [v3 设计](v3-design.md)保留原四操作和两张 SQL 表，增加公开闭包与 Cordis 服务的 `readEvaluation`：同一 ReadTx 固定当前 head，选择本会话 `seq ≤ head` 最近 given/mint 的完整求值；reuse 旧表不令已提交根设置回退。追加仍收任意合法 JSON，新读面单独校验两个投影槽位。源码路径 `packages/assets/assembly-manifest-store` **尚未建包**；共享 AE4 公共 `judgeEffectiveAssembly` 的设计表达已对齐：全量判定五类闭合 DTO 与开放 JSON 槽，完整原值交回；不证明来源或权限。实现与制品消费、生产链及装配仍见 AMS3-1～AMS3-5。
- **绑定与证据：0 条。** [`bindings.yaml`](bindings.yaml)保持空；旧义务全部保留，新增 ME-1～ME-8 尚待实现后执行。其他 core 节点的既有证据不覆盖本 SQL 读取链。
- **实际验证：尚无。** 文档检查不代表源代码、真实存储、Cordis 换代或模型纵线通过。独立评审、采用和实际验收由主线另记。

本次技术验收消费者为 `apps/model-request-acceptance`；迁移、同库单属主、升级确认、入口身份与观测接线归该装配。会话 JSONL 仍由其节点承担模型锚点和响应/回复落盘，不与清单建立跨存储原子承诺。新读面只读已提交求值；runtime/v3 S-66 当前输入归 `packages/assets/evaluation-input-store`，本历史读面不能替代其新鲜读取与重求责任。

| 当前问题 | 入口 |
| --- | --- |
| 五操作投影、最新已提交求值与旧表来源怎样区分 | [v3 候选设计](v3-design.md) |
| 原义务保留范围、新增真 IO 与组合验收 | [v3 候选验证义务](verification.md#v3-候选增量的证据义务) |
| 旧 v2 的设计和接受范围 | [原设计](design.md)及下列历史状态 |

## 既有 v2 设计与接受范围

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.assembly-manifest · v2`（[契约](../../../../spec/capabilities/assembly-manifest/v2/contract.md)，状态 `accepted`，已接受、已冻结）的**全部条款**（四个操作：`readHead`、`append`、`readHistory`、`dependencyPresence`），作为它第十一节说的「本版的最小提供者」（D-063 R-1）
- 源码位置：`packages/assets/assembly-manifest-store`——**尚未建包**。第一层 `assets` 由 D-059 拍板；本节点放在这里是本批的划分，真承接者 PF-004 那一程到来时若归别的领域，搬动是「实现换方案」（缺口 AMS-9）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 公开面：**公开函数面**是条件追加的判定与在场作答（纯函数），以及不依赖 Cordis 的闭包 `createAssemblyManifestStore(storage, options)`（候选名，给它任一符合 `core/storage` 协议的存储即可用）与两张表的迁移片段；**Cordis 服务面** `assemblyManifest` 是闭包的一种消费者（[design 的公开面](design.md#公开面)，[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）
- 契约采用与边界依据：**一个 Cordis 插件、一条 fiber，必需 inject `storage`，不 inject `clock`**（表时刻由写入方给，本节点只比较；求值引用用随机数铸，不用时刻）。两张表经 [`core/storage`](../../core/storage/README.md) 落在据点那一份 `storage` 里；**条件追加的判定与写入在同一个写事务里**，共同存储对象是 (会话, 序号) 主键（契约 [S-12](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-12-条件追加判定与写入是同一步)）。
  **`dependencyPresence` 是本服务的一个查询，不另设服务键**（D-060 §八 N-37 ②）；在场事实由装配以配置交进来——**验收装配给测试种子，产品装配没有来源**（契约 G-2），那时每次都答 `unavailable`。
  **只兑现窄口，不扩展契约**：服务上恰是契约的四个操作——没有写在场事实的方法、没有删除、不解释记录内容，派发器读链与模型请求运行时读求值结果本版不给（契约 G-4）。
  它**取代**据点装配[验收装配](../../../apps/cli/design.md#验收装配)里「装配清单」那个替身；**真承接者**是 PF-004 那一程（契约 [G-1](../../../../spec/capabilities/assembly-manifest/v2/contract.md#十已知缺口)，据点装配缺口 C-2）。产品据点清单本版不装它（据点装配[关键选择 5](../../../apps/cli/design.md#关键选择)）

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**设计已接受**（2026-09-26，D-062；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：本节点声称兑现的条款逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)，并逐条接住会话资产注册表的 [R-M1～R-M9](design.md#会话资产注册表的要求r-m1r-m9的承接互指)。**尚未建包、没有一行源码**。
  **有前提**：在场事实只在给了来源的装配里答得出（本版只有验收装配，AMS-2）；提交即持久在操作系统崩溃或断电时按 D-027 的 `NORMAL` 口径有边界（契约 G-3，AMS-4）；升级快照被恢复时确认之前写下的记录消失（AMS-5，归装配）；派发器读链与模型请求运行时读求值结果**本版读不出**——记录内容原样存、原样交回，读法未约定（契约 G-4，AMS-3）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空**。契约本版不建形式工件（契约 S-25），没有可绑的 formal task；本节点没有源码、没有测试
- 实际验证：**尚无**

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 两张表长什么样、条件追加怎样在一个事务里判、共同存储对象与反证 | [实现设计](design.md) |
| 注册表的 R-M1～R-M9 落在哪 | [实现设计：互指](design.md#会话资产注册表的要求r-m1r-m9的承接互指) |
| 对存储提供者要什么 | [实现设计：要求清单](design.md#对存储提供者的要求清单) |
| 哪条承诺由哪份证据支持 | [绑定表](bindings.yaml)（空） |
| 证据义务、还缺什么 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 record/decisions。

## 2026-09-27 本轮技术采用

D-074采用本轮增量设计；精确输入哈希另记，候选历史读数保留原字节。实际源码、符合性与组合证据另核，旧绑定不重标。

## v4 候选增量（2026-09-27）

本节是当前 v4 状态入口，上方的 v2/v3 历史状态及其采用范围保持原记录。

| 分层状态 | 当前范围 |
| --- | --- |
| 语义接受 | **无。** 精确输入为同一基线的 [capability.assembly-manifest/v4](../../../../spec/capabilities/assembly-manifest/v4/contract.md) 全部 S-1～S-37；[asset-registry/v4](../../../../spec/capabilities/asset-registry/v4/contract.md) S-51/S-52 为消费者交接。两坐标已在 [catalog](../../../../registry/catalog.json) 登记 candidate，本稿亦未采用；D-074 不延伸到 v4 |
| 可实施范围 | [v4-design.md](v4-design.md) 给出六操作候选投影：新增公共 readGiven(session,H)，同 ReadTx 实读已提交头并选 H 内最后 given，完整原值交回；精确请求整数与实际序号容量分开；仅首条 parent INSERT 唯一冲突可同事务重判，table 失败必须整次回滚。MF3 五操作源码已存在且正在施工，不能据此称 v4 已实现；精确规格与本稿采用后才能实施第六操作 |
| 绑定与证据 | **0 新绑定。** [bindings.yaml](bindings.yaml) 不改；[MG-V1～12](verification.md#v4-候选增量的证据义务) 是可失败的待执行义务，旧证据不提升版本 |
| 实际验证 | **无本版产品验收。** 本次只形成候选设计及文档检查结果；真实 SQLite 六操作、公开制品、Cordis 装卸、registry/EIS 生产链与 PostgreSQL 均须分别取证 |

实施与归装配边界见 v4 设计 MG-1～8、R-AMS4-1～5、MG-G1～5。`apps/model-request-acceptance` 拥有同库与升级确认、入口身份、有界诊断端口及真实组合验证；storage 被借用，闭包停止准入后等在途操作真实结束。MF 只返回源记录，不解释 filledBy，也不替 AR4 接受原完整 fill 或替 EIS 证明权限。缺口与受阻消费者沿 v4 设计及验证追加段登记，不由本文接受。

D-079精确采用 v4 增量。新增 readGiven 与全来源组合尚待实现验收；旧候选输入字节保留，绑定0。

## 2026-09-27 六操作实际组件检查

源码已建于 `packages/assets/assembly-manifest-store`，本次 MF4 组件测试 76 项通过，含真实 SQLite/重开/并发/唯一约束回滚/SIGKILL/Cordis 排空。公开打包导出在仓库外目录通过声明编译和实际运行；全仓 build/typecheck 与实际规则扫描通过。记录及限度见组件证据。这不补证 AR/EIS 的完整生产来源链、装配退化查询、PostgreSQL 或生产模型认证；bindings 仍 0。上方候选与未实现字句保留其原事件状态，由本段接续。
