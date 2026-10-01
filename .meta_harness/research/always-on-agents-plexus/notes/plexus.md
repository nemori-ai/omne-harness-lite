# Plexus / Personal Edition 的当前读数（2026-10-01）

这是一份只读证据整理，不是新设计或接受结论。用户明确说 Plexus 是其自研；以下按既有系统资产处理。没有读取凭据、环境文件或个人业务数据，没有启动服务、执行测试或更改产品代码。完整绝对路径与版本见 `sources.json`。

## 定位和状态

- Personal Edition 实际在 `/Users/pandazki/orca/workspaces/omne-next/personal_edition`，branch `feat/personal-edition-next`，HEAD `d1f4e5342abe2526bc0ac1e147e340558f7de618`，2026-09-30，提交主题 `feat(personal-edition): integrate managed Plexus resources`。工作区只有预先存在的未跟踪 `.impeccable/`；未触碰。
- 配套 Plexus 实际在 `/Users/pandazki/Codes/plexus/.claude/worktrees/omne-desktop-integration`，HEAD `d84421fcf981b0c7d3f624ba95a62d81523f6402`，2026-09-30，`feat(host): add secure native desktop integration and scoped events`。所查工作区干净；软件版本 0.9.1，实际代码协议 0.1.4。
- `/Users/pandazki/Codes/plexus` 主检出停在 `595a5f9`（09-08），而 `/Users/pandazki/orca/workspaces/plexus/review` 更旧。不能从旧检出 README 的 protocol 0.1.3 判当前配套协议。
- Personal Edition 的 `omne_plexus/docs/index.md` 和 `VERIFICATION.md` 是这次集成最直接入口。现有本地安装、native provider 和实际模型 E2E **有记录**；本次没有重新运行，因此报告的是记录和源码可见事实，不是独立验证通过。
- Session resource interface 明写 **Draft / implementation-ahead-candidate**；ADR-C027 明写 **Proposed**，开发获授权不等于架构 ratification/release/support。lite 当前导航/非legacy设计范围未搜到 Plexus/personal edition 对应正文；这不证明 lite 不存在相邻承诺，且这些 OMNE-NEXT 材料不能自动提升为 lite 的现行接受规格。未使用 `design_legacy` 作依据。

## 资源究竟是什么

1. **OMNE accessible resource** 是某 provider 操作的具体参数绑定，不是 Resource subsystem 的 compute lease，也不是单独 agent。State 的 binding 有 UUID 身份、tenant/user/agent/session owner 坐标、provider reference、purpose、operations、provider generation 和自身 generation。standing 包括 prepared/active/paused/completed/unavailable；明确动作 activate/pause/resume/complete。重放同一创建意图收敛到原绑定，不把 paused/completed 的对象隐式重新激活。[PE-RESOURCE][PE-WIRE]
2. **Plexus provider binding** 则保存 UUID7、准确 capability/workflow/skill 身份、connection 和 enrollment fence、schema/required verbs/attached skill 的合同指纹及私有 grant custody。变更 capability 语义或凭据不会悄悄沿用旧绑定。[PE-STORAGE:36–141][PE-PROVIDER:323+]
3. **Plexus Source/Capability** 是另一层：Connector→Source→Capability；source 配置可动态增删重配并持久到 sources.json，运行时 registry 是当次进程权威。它使本机软件的操作与使用知识可发现，不是把每种业务意图都做成资源类型。[PX-README][PX-SOURCES]
4. 历史卡片是绑定的展示，不拥有状态真相。已有 BOT 委派只复用 resource card/peek 展示，既有 actions/data source 保持原 owner；目录失败不得隐藏 BOT 活动。[PE-CARD:120]

## 权限和代理委派

- Plexus 的管理面由 owner/可信桌面主进程持 connection-key；agent 是普通 PAT 客户端，PAT 证明稳定 agentId，并通过 Session→scoped grant/token 调用已授权子集。Source setup/approval 不变成模型管理权限。[PE-INTEGRATION][PE-PRODUCT]
- OMNE 另有 Harness 委派断言：provider 验 audience=omne_plexus、effect-specific scope、tenant、Session、时间、调用 actor，再向 State 读取真实 owner；不相信调用者自报 agent_id。写/execute 都映射 Harness write，并要求 `access.plexus.call`，read delegation 不能执行写。[PE-AUTH][PE-STORAGE]
- 两个“委派”不能混同：这里 delegated assertion 是服务调用授权；既有 BOT delegation 是其他 agent 的工作委派。Plexus 独立产品能暴露 Claude Code/Codex launchers，但 Personal Edition 当前选择器**明确排除长运行 coding-agent launchers、泛命令执行及未受限 native automation**。不能把 Plexus 的独立能力清单当作 OMNE 已开放的多agent委派。[PE-PRODUCT]
- 文档冲突必须保留：Plexus security-model 的开头/部分旧段落称 execute 永不能 standing，而同文件后文、README、实际 `grant-service.ts:460–520` 已有 owner 对特定 agent+capability 显式 opt-in 的例外。准确当前读数是“默认 per-use，agent 无权自行提升；owner 可明确提升”，不是绝对 never-standing。[PX-SECURITY][PX-GRANTS]

## 持久状态、重启与跨会话边界

| 层 | 留住什么 | 明确边界 |
|---|---|---|
| Plexus 持久层 | 已配置 source、agent enrollment/授权子集、standing grants、审计等 | 不是 OMNE 记忆或 Session 状态 owner |
| Plexus Session | PAT认证的一次权限episode，最长60分钟 | 纯内存，gateway重启丢失；不能等同 OMNE对话Session |
| Plexus async run | 同 agent 可跨新的Plexus episode读自己的run结果；完成后保留1小时，最多8个running/agent | run/result cache也是内存；gateway重启丢失。audit是持久产物，结果缓存不是durable execution |
| OMNE Plexus adapter | 私有SQLite保存binding、原Session审批custody、call receipts、job receipts和terminal observations | provider重启可恢复；不能把上游已经丢失的run恢复出来；unknown不能当success或重新dispatch |
| Harness State/Inbound | binding生命周期、观察cursor/lease/evidence、同Session admission/FIFO | pause/completion/generation fence阻止新continuation；这里只回原Session，无跨Agent fan-out/general reaction |

来源：[PX-SESSIONS][PX-RUNS][PE-INTEGRATION][PE-STORAGE][PE-PROVIDER][PE-RESOURCE]。

`provider.call:464` 在dispatch前claim durable attempt，相同request重放返回receipt；响应丢失后报告unknown且不再次发送。这是“防重复派发”的具体保证，不能写成所有外部操作全局exactly-once完成。`collection:514` 可以为同一enrolled agent重新handshake读取已接收job，**不重新grant/invoke**。`collect_job:551` 对已失去的上游结果保留unknown。旧invoke binding遇到gateway重启/权限episode失效，需要新binding，而不是adapter静默重铸授权。

## 与 always-on / memory / state / governance 的关系

**可以把 Plexus 看成已经存在的外部能力接入和局部授权治理层；与 adapter、State/Inbound 组合后，已有连接外界动作和任务状态的具体路径。** 它不是“待从零创造的connector”。异步工作接受后，provider持续查询完成事实，Inbound/State把完成通知送回原Session；没有变化不触发模型。VERIFICATION记录了真实Electron+native Plexus+容器Harness/provider+真实模型的这条路径，也记录了restart/rebind/revocation。[PE-INTEGRATION][PE-EVIDENCE]

但现有事实不能推出以下更大保证：

- **没有通用外界内容变化订阅**：当前Plexus adapter订阅明确仅覆盖已接受job的terminal facts，不覆盖calendar/file/note业务变化。Directory/Gmail其他provider的观察能力不能自动算Plexus也有。[PE-INTEGRATION][PE-PRODUCT]
- **没有跨OMNE Session自动工作流/跨agent目标路由**：该候选接口明确只有原Session continuation，无谓词、fan-out、reaction template。稳定Plexus PAT跨episode ≠ OMNE跨Session长期任务语义。[PE-RESOURCE]
- **没有durable上游执行恢复保证**：Plexus run/result内存态在gateway重启后丢失；OMNE私有receipt只能如实报告和阻止误重发。[PX-RUNS][PE-PROVIDER]
- **没有撤销已发生副作用/原生job cancel/事务rollback保证**：adapter明确不暴露native job cancellation；flat workflow顺序fail-fast但早先效果不回滚；Plexus协议也明确revoke不会终止已dispatch的工作。[PE-INTEGRATION][PX-PROTOCOL]
- **没有证据把它称为长期认知记忆owner**：它有操作状态、持久授权与审计，能访问笔记/文件知识，但所查声明和实现不定义记忆提炼、偏好/目标整合或学习更新。OMNE-NEXT根导航把知识表征/治理归Engram，证据/认知/非线性需求目标归Cognition。这里是“现有职责定义不归它”，不是全仓无相邻能力的证明。[PE-ROOT][PX-README]
- **不是完整Harness治理替代物**：Plexus保有自身的能力/verb/来源授权与审计；Harness仍拥有official action semantics、tenant/session身份、运行准入与binding lifecycle。模型对已授权任务的确认策略不替代任一真实provider拒绝。[PE-INTEGRATION][PE-RESOURCE]

## root后续最值得核对的位置

1. `omne_plexus/docs/index.md` 与 `VERIFICATION.md`：先读取已实现能力及已记录验收，避免把昨天完成的工作再当方案建议。
2. `omne_harness/design_docs/interfaces/session-resource-access-contract.md`、ADR-C027、对应 requirements intake：这是把异步完成恢复原会话的范围与candidate状态说清楚的入口。
3. `omne_harness/traceability/cross-subsystem/flow-realization-matrix.md#f-session-resource-access`：若要把状态/观察与长期待机方案做进一步对应，从现有实现映射进入。
4. `omne_harness/adrs/accepted/ADR-080-active-configurable-multi-channel-reaction-and-agent-wake-ownership.md`：候选明确把general reactions交回此已接受owner；后续若关心“非job终结的外界变化怎么唤醒”，值得独立核对。
5. 当前lite自身的 State/Inbound/记忆/认知与权限已接受规格，需root从lite registry另行定位。不能用这里的OMNE-NEXT实现反向替代lite架构接受。
