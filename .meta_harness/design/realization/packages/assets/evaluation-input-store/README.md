# evaluation-input-store

- kind：`provider`，2026-09-27 首稿，**candidate**。
- 节点及源码路径：`packages/assets/evaluation-input-store`，**尚未建包**。
- 兑现边界：`capability.model-request-runtime/v3#S-66` 的当前输入读取端口，以及 AE4 的真实来源前提。一个本地 SQL 输入存储、公开函数闭包和一种 Cordis 包装；不反推历史求值、不代替 runtime 调 evaluate、不实现产品资产治理或中心同步。
- 本轮装配：`apps/model-request-acceptance`，负责显式初始发布、实际会话建立、源更新及初选模型；只交付模型纵线技术验收消费。

## 分层状态

- **语义接受：无。** 本节点仍为候选；runtime3、AE4、AD1 等精确依赖的接受状态及采用依据以 [registry catalog](../../../../registry/catalog.json) 为准。源节点选择来自[读取链提案](../../../../record/proposals/model-request-adaptation/read-projection.md)及主线派工，不自动提升为已接受。
- **可实施范围：候选设计。** [design.md](design.md)明确资产版本、层持有、会话捕获记录及真实资格读取的兑现点。沿 D-042 的同一 SQLite/AtomicStorage 组合，复用组织治理参与面；PG、分享、已挂载工作区与尝试动作集分支尚不满足本节点来源保证，整次 unavailable。共享根来源 selector 与 AD1 提取组件仍待实施；完整输入准入复用 AE4 evaluate，runtime 保留自己的纯求值消费，不另建输入 judge。
- **绑定与证据：0 条。** [bindings.yaml](bindings.yaml)为空；既有 storage/治理/core 证据只覆盖原节点，不证明本组合。
- **实际验证：尚无。** [verification.md](verification.md)登记真实发布、重开、并发、资格撤销和零 HTTP 的义务；文档检查与独立评审均不等于实现通过。

## 导航

| 问题 | 入口 |
| --- | --- |
| 发布、捕获、读取怎样走通，权威表与共同事务在哪 | [实现设计](design.md) |
| 哪些来源分支受阻、由谁补齐 | [实施缺口](design.md#实施缺口与消费者影响) |
| 真实存储及完整模型链怎样验收 | [验证义务](verification.md) |

租户归属只从真实 sessionTenancy 获取；捕获的 standing 用于配方，当前资格另由真实 memberships 同事务现读。不将 captured standing 当成当前授权。已有清单中存在合法旧 E 不能使本源不可读变成成功。

## 2026-09-27 本轮技术采用

[D-074](../../../../record/decisions/model-read-provider-adoption/decision.md)采用本轮增量设计；精确输入哈希另记，候选历史读数保留原字节。实际源码、符合性与组合证据另核，旧绑定不重标。

## 2026-09-27 来源接口技术采用

[D-077](../../../../record/decisions/model-source-interfaces-adoption/decision.md)采用 [source interfaces revision 1](v3-source-interfaces.md)。旧裸清单明确拒绝，不推断 meta。registry 原 fill 的公共来源认回仍由 registry owner 闭合；新增接口实际验证另外记录。

## 2026-09-27 实际组件实现与检查

源码已建于 `packages/assets/evaluation-input-store`，包含普通读取、受限固定根读取、发布/捕获、迁移及 Cordis 插件。D-074/D-077 的采用范围不变。真实 SQLite/account/login/OG/STT 组件测试共 45 项通过，build 与 typecheck 退出 0；静态边界工具完整 386 项测试通过，实际源码扫描通过。实际记录见 [组件证据补充](../../../../record/evidence/2026-09-27-probe-model-request-runtime/component-checks.md)。

本次为实施者组件检查；没有独立验收结论，不将各表的场景自动标成完整通过。原 fill 来源认回 SI-G1 仍待 manifest/registry 真组合；runtime 消费、两次求值的端到端量测、完整 source 竞争负控及验收应用未完成。bindings 仍为 0，生产模型认证仍为 0/37。上文“无实现”的历史读数由本段接续，不重写旧采用输入。

## 2026-09-27 历史正文读取增量候选

[v4-history-source-interfaces.md](v4-history-source-interfaces.md)补齐 AR4 历史表所绑定的不可变正文读取：候选 `./registry-history` 闭包先以真实 STT 核租户归属，再从真实 MF4 历史表核 capability/asset/精确版本，最后在 EIS atomic 中核当前 OG 资格并读取原版本。原资产已不再持有时仍可恢复；该正文不进入普通 EvaluationInput，不改固定根 C16 规则。

- **语义接受：上游已接受，本增量未接受。** D-079 接受 MF4/AR4 及 MF4 provider；本稿是 EIS 技术投影候选，AR4 provider 的并行评审不自动接受本稿。
- **可实施范围：待独立评审和采用。** 只增受限公开闭包，不增服务、身份或存储。可信 app 拥有 reader/close 并绑定真实 MF，registry 借用；当前资格与历史表用途分开。明确范围见 HI-1～HI-6。
- **绑定与证据：0 条。** bindings 原字节不改；新增 HI-V1～HI-V9 是[未执行义务](verification.md#历史正文读取增量义务candidate2026-09-27)，不是证据。
- **实际验证：新增面尚无。** 旧 45 项组件检查不涵盖历史面。AR4-G3/HI-G1 的旧报告、未持有旧版本成功恢复仍阻断完整交付，正确返回 unavailable 不代替成功验收；SI-G1 真组合仍归 registry/MF/EIS/app。

## 2026-09-27 历史读取增量技术采用

[D-080](../../../../record/decisions/model-registry-history-provider-adoption/decision.md)精确采用本增量；上方候选状态保留该次成稿事实。源码与适用验证义务继续独立落实，真实成功恢复尚未验收，新增绑定0。

## 2026-09-27 历史正文组件实现检查

受限历史读面与对应 AST 入口守卫已实现；EIS 全组件 68 项测试、工具 428 项测试、构建/类型检查及实际源码规则扫描通过。[运行与限度](../../../../record/evidence/2026-09-27-probe-model-request-runtime/eis-history-component-checks.md)保存真实版本发布/移除持有/换表/重开、当前资格竞争及零 MF IO 场景。MF 表项仍是明确的组件 fixture，真实 AR producer 与旧报告恢复、装配退化查询/OS 权限/独立制品消费未验证；HI-G1/AR4-G3/SI-G1 继续开放，bindings0。
