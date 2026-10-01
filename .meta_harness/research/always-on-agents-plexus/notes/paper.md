# Always-On Agents — 独立论文事实读数（封存）

状态：2026-10-01 完成第一轮独立读数；未读取 Harness lite、Relay、Plexus 的设计、实现或历史报告，因此以下性质与风险不来自既有方案。本文是论文事实与研究辨析记录，不是产品规则、架构决定或接受结论。后续比较不得把论文提出的评价协议直接当作项目必须采用的数据结构。

## 1. 来源与实际阅读范围

- 准确题名：*Always-On Agents: A Survey of Persistent Memory, State, and Governance in LLM Agents*。
- 作者：Tianyu Ding、Aditya Nannapaneni、Bingfan Liu、Ling Zhang。
- 采用版本：arXiv:2606.30306v1，2026-06-29 13:47:42 UTC；本次查询 abstract 页仅列 v1。arXiv 类别 cs.MA、cs.AI，页面标注 CC BY 4.0。
- 官方元数据：[arXiv abstract](https://arxiv.org/abs/2606.30306v1)；官方全文：[HTML](https://arxiv.org/html/2606.30306v1)、[PDF](https://arxiv.org/pdf/2606.30306v1)。正式题名空格以全文为准，abstract 页显示有空格粘连。
- 获取方式：web 工具打开元数据和 HTML；随后 Python urllib 从官方 URL 下载 HTML、PDF、abstract HTML，`pdftotext -layout` 提取。PDF 为 136 页，正文/附录到 p109，余下是参考文献。`page-NNN.txt` 对应 PDF 的一基页码，`paper-layout.txt` 保留分页；可回放原始材料。
- 深读：§1–4（尤其 pp8–12、16–43）、§5（pp44–53）、§6（pp53–61）、§7.1/7.5–7.7（pp62、65–69）、§8（pp70–81）、§9（pp81–88 起始）、§11–12、附录 A（pp98–109）。§10 是领域应用巡览，本次没有对其每个实例独立验读；§7.2–7.4 的具体 benchmark 描述未全部逐段展开。不存在“已独立复验 435 篇”的声明。
- 仅向后追两项关键 primary：GEM（2605.26252v1）与 ACRFence（2603.20625v1）；详见 §8。原始文件与 SHA-256 在 `sources.json`。

## 2. 论文实际主张：它研究的对象是什么

**论文事实/作者定义，§2.1 pp16–17、Table 6 p20：** always-on 不等于每秒连续运行。其分类条件是：（1）跨 session/restart 有持续身份；（2）有 agent 自有、可变且持久的状态；（3）后续行动能受这些状态影响。按天唤醒、事件唤醒、仅用户打开才运行都可在内；一直运行但每次完全重置则不在内。第四项 temporal accountability 是 consequential persistent state 产生的治理义务，不是把不完善系统排除出定义的分类门槛。

**论文事实，§1 pp5–7、§3 p24：** memory 是持久状态的一部分；task ledger、permission/consent、credential、trigger、shared state、provenance/audit 也影响未来。外部承诺和副作用不是 agent 的内部记忆，它们属于必须与授权状态保持关联的责任范围。

**论文事实，§2.2 pp17–19：** 纯单次 long-context、只读 curated-corpus RAG、按任务重置的 episodic agent 不自动成为 always-on；跨 session 自写自读的 memory-augmented agent 则是 always-on 的子类。personalization/proactivity 是持久状态的用途或类型，不是定义本身。

**解释边界：** 论文某些叙述把“有 memory”与“governed always-on”对举，易造成“未治理就不算 always-on”的误读；应以 §2.1 的三项分类条件及第四项义务为准。

## 3. Taxonomy 与方法

### 三层状态分类（§3、Table 7 p32）

| 层 | 论文所列内容 | 核心区别 |
| --- | --- | --- |
| Object state | episodic traces、semantic facts、preferences/user models、procedural skills、workflow/task commitments、shared/social state、trigger conditions | 跨时刻保留的对象内容 |
| Governance envelope | authority/permission、scope/ownership、tool/credential capability、provenance/audit、retention/deletion/rollback handles、trust/confidence/temporal validity | 决定对象何时、由谁、在哪个范围可以影响行动，以及怎样修复 |
| External commitments | message/payment/file/DB row/ticket 等已提交的外部效果 | 不能假设内部状态恢复就能撤销 |

§4.1 p34 的抽象记录是 `s = <v,a,c,m,p,r,k,τ>`：值、授权、范围、可变类别、来源链、恢复关联、行动类型、逻辑时间。它是作者的分析/协议表达，不是普适数据库表设计。

### 六条诊断轴（§2.3 pp19–22）

- Authority：是谁或什么授权此记录影响当前行动？记录存在、内容真实、被高频召回，都不能自行产生授权。
- Scope：允许作用的 user/task/tool/time/group 是什么？来源上下文不能在合并或共享中悄悄变宽。
- Mutability：可修订、仅可 supersede、可衰减或锁定？事实、偏好、权限变化的时间尺度不同。
- Provenance：来源、时间和变换链还在吗？摘要保留意思不等于保留来源。
- Recoverability：能识别该记录影响的后续记录、决定和效果吗？能恢复什么，不能恢复什么？
- Actionability：是 evidence、preference、policy、skill 还是 executable commitment？用途越能直接触发效果，所需保障越强。

作者明确说六轴**并非正交**：来源支持授权判断，范围限制授权，行动性改变恢复要求，恢复依赖来源。

### 生命周期、五项不变量（§4 pp33–43）

前向：observe → write → validate → organize → retrieve → act。返向：update / forget / audit / rollback；图式是逻辑生命周期，不是严格只能按序执行的工作流。

| 作者的不变量 | 可观察的禁止情形 | 主要位置 |
| --- | --- | --- |
| Authority monotonicity | 过期/撤销授权继续许可行动；恢复后旧授权悄悄重获效力 | validate、act、permission update |
| Scope non-expansion | 整理、派生、共享或召回悄悄扩大允许的使用范围 | organize、retrieve |
| Deletion propagation | 主记录删了，summary/embedding/cache/prompt/promoted tier/derived record 仍使其生效 | forget、audit |
| Provenance preservation | 内容压缩后已不能验证来源、归属或进行后续修订 | organize、update、audit |
| Rollback traceability | 发现坏记录后无法界定需要修复的决定与外部效果 | act 记录关联，rollback 使用 |

“monotonicity”针对未授权的自动扩权，不应解读为用户以后永远不能重新显式授权；“non-expansion”也不是禁止任何获授权共享。论文用语是不得 silent re-broaden / silently widen。

## 4. Corpus 证据能支持多强的结论

**论文报告，§1.1 pp8–12、Appendix A pp107–109：** 435-work scoped map；时间窗口 2023-01 至 2026-06，允许更早认知科学等基础文献。来源 arXiv（cs.AI/cs.CL/cs.LG/cs.CR）、Semantic Scholar、OpenReview、ACL Anthology。以近期 survey 和 closest-work seed 起步，双向追引两跳，迭代 term-set sweeps，且有意强化 governance/rollback/authority/deletion/durable execution/formal verification/DB/distributed/HCI 方向。

Table 2 的 97 + 147 + 171 + 2 + 18 = 435 是**纳入数**；早期 rejected-candidate IDs 没有一致保留，作者明确不把它当完整 PRISMA screening/exclusion flow。每项编码 category × lifecycle-stage × state-axis × subarea，后两类/生命周期可多标签，数量不可加为 435。作者说数字由脚本重算。

| Lifecycle stage | 数量 |
| --- | ---: |
| retrieve | 269 |
| write | 200 |
| act | 141 |
| organize | 128 |
| update | 127 |
| audit | 88 |
| validate | 87 |
| observe | 68 |
| forget | 66 |
| rollback | 27 |

Authority 72/435、recoverability 112、provenance 153、mutability 160。**这些是作者编码的关注/覆盖，不是已实现且测试通过的系统数量。** Figure 6 的 invariant coverage 更只是相关 lifecycle stage 出现的 proxy opportunity，作者明说不能据此认定论文测试或强制了该不变量。

第二编码者盲查 236 篇：lifecycle pooled agreement 0.82、Cohen κ=0.58；state-axis agreement 0.74、κ=0.44，属 moderate agreement。rollback 标签在任一编码者标过的 19 篇中，仅 11 篇双方都标过。精确 27 需容许若干篇偏差，方向性差距比单格数字可靠。

27 又混合 internal-state rollback、workflow compensation、external-effect rollback，不能说 27 篇都解决了外部不可逆效果。连续运行/周期唤醒/session-triggered 也被聚合，故风险发生率不能直接外推。

**可支持的论文结论：** 在其检索与编码范围中，前向积累/召回比返向撤销/恢复更受关注。**不能支持：** 对全领域的完备普查；“全世界没有系统做 X”；把 raw count 当市场采用率或执行正确率。前沿多为 2025–26 preprint，持久生产有效性未定。

## 5. 核心机制读数和风险（论文事实，未替前作背书）

§5（pp44–53）区分 parametric/test-time、context、vector retrieval、graph/temporal、multimodal、agentic-OS/runtime、systems/resource substrates。它认为不同载体提供不同原生保障，非原生轴仍可用 envelope、sidecar、access-control、transaction wrapper 补足。**不是“vector DB 永远不能治理”的不可能性结论。** runtime checkpoint、event log 和可追溯 memory 若各自独立，也不会自动形成跨层恢复。

§6（pp53–61）五族：memory managers/graph 强 write-organize-retrieve；reflection 把 trajectory 变 lesson，风险是自证错误；skill/workflow 把经验变可执行工件，风险是环境漂移、权限过期和可调用性放大损害；continual adaptation 面临积累带来的干扰/压缩/维护退化；shared memory 把上述错误跨主体传播。作者的 controlled-compounding 标准（§6.6 p61）是：后续回归若定位到早前某次 write/reflection/skill/consolidation/shared-entry，能识别、去授权并撤回该更新及派生状态。此标准是作者提出的治理判据，**不是已证明所有自我改进必须具备 literal undo 的数学定理**。

§8（pp70–81）把风险定位到变换边界：

1. 普通互动或 tool/web/file 输出中的不可信内容，被持久化后在后续 session 变成指令；当前 prompt 过滤抓不到历史污染。
2. consolidation 丢来源、角色、精确 ID/date/key，或用多条源自同一坏记录的总结伪装相互佐证。
3. retrieval 后仍会发生过度影响：召回内容正确，不等于当次应被使用；许可合法的工具也能被坏记忆选成上下文错误的行动。
4. stale fact/permission/commitment；局部更正不传播，旧 derived summaries/skills 继续工作；用户撤销偏好与偏好遵循是不同目标。
5. 删除只修改一个索引；别名、多跳、摘要、已共享副本等仍能恢复内容或影响行为。衰减/不可达不是已实现全域删除。
6. 多主体污染跨 shared state 传播；一方退组/授权撤销后需要处置已传播的副本与派生状态。
7. recovery 自身会引入攻击：内部 checkpoint 恢复后，模型重新生成略不同 tool arguments，外部服务当成新请求；已消费权限也可能重新出现。
8. audit retention 与 erasure 冲突；来源证明要保留什么，内容要删除什么，不能靠“日志不可变”自动化解。

威胁模型 §8.1/Table 15 p71 强调**按用途信任**：工具可被信任提供天气，不等于可写永久指令；collaborator 有 proposal/edit 权，不等于可拓宽他人范围；consolidator 继承源权限，不自动取得新增权限。

## 6. AOEP-v0：贡献、真实结果和实验边界

**作者原创贡献，§9 pp81–88：** AOEP 是 evaluation contract + local pilot，不是新生产 memory engine、通用防护证明或产品排行榜。episode 为 typed event stream；末端中性 probe 重建 snapshot，由 harness 确定性重算 invariants，不信任系统自报 boolean，不用 LLM-as-judge 作为最终治理判决。

Event 包含 idempotency key、parent/supersedes/conflicts-with causal links、transaction ID、permission epoch、trust tier/optional signature、source ID、privacy/retention/TTL/confirmation；11 个 operation 是 read/write/update/delete/tombstone/share/unshare/validate/quarantine/deny/rollback。Snapshot 包含 deletion ledger、rollback ledger、pending conflicts、permission epochs。**这些是 AOEP 的具体表达选择，不是六轴唯一表达。**

协议拆分 positive obligation pass 和 negative-invariant pass：什么都不记的系统可不泄漏，却无法满足删除记账、报告当前权限、阻挡 stale/untrusted task、显露冲突、登记 rollback 等正义务。把二者揉成一分会奖励失忆。五 invariants 映射到八个 snapshot boolean + 两个 ledger subset check；这些有限代理检查不等于一般 provenance preservation 或全存储层物理 erasure 的证明。

**Table 18 p85，作者报告：** 9 fault patterns，主要 reader Qwen2.5-7B greedy，本地 embedding/store；7 个系统。

| 系统 | Obligation | Negative invariant | All（不宜主打） |
| --- | --- | --- | --- |
| Governed reducer | 15/15 | 41/41 | 92/92 |
| No-memory | 0/15 | 41/41 | 77/92 |
| Naive append | 7/15 | 40/41 | 83/92 |
| Full context | 7/15 | 40/41 | 83/92 |
| Vector-RAG (MiniLM) | 7/15 | 40/41 | 83/92 |
| Mem0-style fact extraction 重实现 | 4/15 | 38/41 | 77/92 |
| 实际 mem0ai 本地配置 | 3/15 | 36/41 | 73/92 |

Governed reducer 直接实施 AOEP rules，说明参考 harness 的义务可满足；它不是可部署产品，成功也不是对一般自治推理能力的验证。raw-storage 三种系统分数相同，在所试配置里说明换召回方式没有解决治理状态缺失；fact extraction 丢失 envelope 是作者的配置级解释。

**§9.5 pp85–87，稳健性扩展：**

- full-context 4 reader：Qwen2.5-3B/7B 与 Llama-3.1-8B 各 7/15，Mistral-7B 4/15；非模型 scaling law。
- temperature .7/top-p .95，5 seeds：6–8/15、mean 6.6、SD .8。
- 3 人工编写 realistic multi-actor episodes（tau-bench-style refund、TheAgentCompany-style scheduling、AppWorld-grounded Venmo）：reducer 9/9，raw storage 4/9，Mem0-style 2/9。不能说三者都原样执行完整官方 benchmark。
- 3 genuine AppWorld API traces：Venmo、Spotify、filesystem，真实 API 效果经检查；之后加的攻击 note 和 probes 是作者编写。reducer 7/7，ungoverned 3–6/7，各在某条 trace 泄漏 untrusted instruction。
- Qwen2.5-Coder-32B 自行驱动 AppWorld，完成 3 个 single-app task，有更难 multi-step task 未完成；在完成轨迹中注入 untrusted observation，reducer 处理、full context 泄漏。32B 是行动 policy，不是把前一 reader sweep 扩展为 32B。

**关键实验缺口，§9.6 p87：** 未做给 extracted-fact store 增加最小 permission epoch + deletion ledger + trust tier 后重跑的 ablation。作者自己要求做完才能区分 architecture limit 与 instrumentation gap。本版只支持所试配置未暴露所需治理状态，不能推出 extraction 天生不行、mem0ai 软件缺陷、强模型永远不能从文本构造状态。

它也没有测完 corruption recovery 的成功率、丢失量、延迟/成本、外部 side-effect replay correctness、长期 hosted multi-task generalization、prospective unprompted governance。最后快照和有限 probe 看不到未暴露层，不能升级为全系统非泄漏/删除证明。本文没有找到 AOEP 代码、435-row coding corpus、schema/validator 独立公开下载地址；HTML/PDF 搜索 github/artifact/release/source-code 没有找到作者资源链接。**未独立复现** corpus 或 pilot；这是检索未找到，不是断言作者从未发布。

## 7. 封存的领域层性质读数（研究者推断，不选择实现）

以下是从上述论文问题空间抽取的**可观察性质**；它们是后续比较的询问框架，不是替项目订规则。每项必须先在项目既定范围内判断适用性与成本。

| ID | 应保护的可观察性质 | 能驳倒它的具体事件序列 | 来源 |
| --- | --- | --- | --- |
| D1 | 中断后身份、未完承诺和已发生结果仍可分辨 | 已完成/已取消任务重启后当成未完成再执行 | §2.1、§3.2.1 |
| D2 | 旧记录影响行动必须仍受当前有效授权和用途范围约束 | 批准后撤销，延迟执行或 retry 仍提交效果 | §4.1.1、§8.3 |
| D3 | 来自观察、反思、摘要的内容不会因被保留/压缩而自行升为指令或权限 | tool output → summary → skill → 外部调用，信任/授权逐段被洗白 | §8.1–8.4 |
| D4 | 更正/失效能影响依赖它的派生状态与未完成承诺；旧事实不会被默认为现值 | fact corrected，旧 summary/skill/trigger 仍许可相同行动 | §4.3.1 |
| D5 | 整理后仍能回答来源、适用范围、时间效力；保留行动所需精确定位信息 | 摘要语义正确但 source/ID/date 丢失，不能核验或命中后续任务 | §4.2.3、§11.2 |
| D6 | 删除/撤回的完成范围与残留能检查，且不因重新召回、重启或共享副本复活 | 删主记录后别名查询、派生 summary、另一个主体仍泄漏/使用 | §4.3.2、§8.7 |
| D7 | 发现坏状态时可界定所影响的后续决定/效果，区分可撤销、可补偿、不可恢复 | 无法定位哪个外部效果受坏记录影响；内部回滚却宣称全部恢复 | §4.1.1、§8.8 |
| D8 | 恢复/分支/重试不重复不可逆效果、不复活已消费授权，且恢复本身有当前权限 | 外部 commit 后本地 crash，retry 改 UUID 后外部重复执行 | §8.2.6；ACRFence §2–3 |
| D9 | 多主体共享与派生不悄悄拓权；争议和撤销的后果可见 | collaborator proposal 覆盖 owner 规则；退组后副本继续使用 | §3.2.4、§6.5 |
| D10 | 主动唤醒的时间条件与授权条件分别满足；会取消已失效触发 | 过去合法的 trigger 在授权/世界状态变更后继续触发 | §3.2.5、§11.4 |
| D11 | 自我改进的增益与回归能分开测，并可定位和停用造成回归的具体经验更新 | 回归后只能重置整个系统，无法识别哪次 reflection/skill promotion 造成 | §6.6、§11.2 |
| D12 | 有用行为和禁止行为分别验收，长时间运行下成本/维护/恢复负担可观测 | 以全拒绝/全失忆获得“100%安全”；只展示 final-answer accuracy 掩盖维护退化 | §5.7、§7.1、§9.3 |

跨项张力也必须保留：删除 vs audit provenance；压缩/预算 vs exact addressability；共享可用性 vs revocation 一致性；低延迟 vs act-time revalidation；灵活学习 vs validation/repair 成本。论文没有给出一套已验证能消除这些张力的统一实现。

## 8. 两项关键原引文核验：明确纠正过述

### 8.1 GEM：综述把结构性观察升级成不可能性证明

Primary：[Is Agent Memory a Database? Rethinking Data Foundations for Long-Term AI Agent Memory](https://arxiv.org/abs/2605.26252v1)，Abdelghny Orogat、Essam Mansour，2026-05-25；本地 `gem.pdf`/`gem.txt`。

综述 §7.5 p66、§9.1 p82、§11.1 pp99–100 称其给出 formal impossibility result，六条件含 rollback traceability，且证明 record-level stores 不能满足条件。

**原文 §3.3–3.4（PDF p3）核得：** 六条件实际是 query soundness、transition soundness、dependency consistency、provenance preservation、bounded active state、retrieval-induced adaptation。没有名为 rollback traceability 的条件。§3.4 自称 “structural claims, not theorems”（仅此短引），其观察针对 pure-function retrieval、CRUD-only relevance-driven forgetting、无 semantic units 的 append-only、untyped propagation 等具体前提。

原文还有 §4 MemState feasibility prototype（Kuzu property graph，公开代码链接），§4.3 明确是 feasibility sketch；§5 把大型 benchmark 列为未来方向。因此“缺成熟 empirical harness”可以成立，“纯理论、无 prototype”会误导。

**判读：** 综述关于 trajectory-level correctness 的组织价值可以保留；形式证明、六条件和 rollback 的具体归因不应继承。不能拿本综述为“记录级系统数学上不可能治理”背书。

### 8.2 ACRFence：攻击经 PoC，提出的 mitigation 未实现验证

Primary：[ACRFence: Preventing Semantic Rollback Attacks in Agent Checkpoint-Restore](https://arxiv.org/abs/2603.20625v1)，Yusheng Zheng、Yiwei Yang、Wei Zhang、Andi Quinn，2026-03-21；本地 `acrfence.pdf`/`acrfence.txt`。

原文 §2–3 p2：两个攻击类别 Action Replay、Authority Resurrection；Claude Code CLI + Qwen3-32B、模拟 MCP bank/cloud/approval services。10 次 checkpoint-restore 试验均 duplicate commit，no-checkpoint 0/10；stateless token validation 下 2/2 reuse 成功，stateful server revocation list 拒绝。小样本/特定 testbed 不能外推为所有框架在所有配置的缺陷。

§4 p2 的 ACRFence 是 tool-boundary effect log + analyzer LLM 判断 semantic equivalent/new intent/consumed credential，再 replay response 或显式 fork 的 proposal。§6 p3 **明说尚未实现和评测 ACRFence 自身**；analyzer misclassification/adversarial evasion、accuracy/overhead 待研究。

**判读：** “恢复不能自动撤销外部效果”“fresh request ID 绕过外部 dedup”“消费状态不可随内部 checkpoint 一起复活”都有本文 PoC 支撑；不能把 ACRFence 当成已验证防线，更不能把 replay-or-fork 与语义判别视为无误机制。

## 9. 研究空白与待核

论文 §11 五条 agenda：全生命周期评估/恢复成功与成本；保留未来定位键且有准入的 controlled compounding；同一个 agent 跨 memory/tool/shared-channel 等多表面、同一 privacy/authority policy 的评估；共享记忆撤销和已失效权限下的 rollback；引入并协调数据库/分布式/形式方法/capability security/unlearning 的成熟理论。

保留未决：

- 435-row coding 与 AOEP source artifacts 未取得，本文统计和实验只是按作者报告转述。
- 未读/复验其余 433 篇原作；“没有安全污染阈值”“记忆最终劣于 no-memory”等强结论只可标明是本综述转引，不能无条件外推。
- §5.6 p49 本身列了 CRAB recovery correctness 8%→100%，§8.8 p80 又提 MEMPROBE recovery accuracy / MTTR-A；同时多处说 corpus 无 recovery success/cost after corruption。可能是不同 recovery 定义和条件，未原文核验前不要浓缩为“完全无人度量恢复”。
- AOEP 的 provenance 检查目前以 no untrusted instruction promoted 为代理，不等于已验证完整 transformation-chain preservation。有限 snapshot/probe 不能保证所有隐藏 tiers 的删除。
- 文中的治理建议并非一套完整形式模型；没有提供五不变量联合成立的 TLA+/Alloy 等证明。不能把研究规范主张直接说成普遍可实现保证。
- 与 Harness lite/Relay/Plexus 的覆盖、缺口、issue 价值留给 root 后续独立机制读数对账，本文件不作结论。
