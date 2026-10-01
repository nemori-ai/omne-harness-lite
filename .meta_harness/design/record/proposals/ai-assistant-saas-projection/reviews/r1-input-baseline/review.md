# R1 评审：需求封存与框架基线核对

**判定：可继续。** 未发现阻断性缺陷。165 功能、23 故事、224 正文需求行、5 条跨模块要求、6 项待定承诺均可逐条回到原文行号；来源建议没有被提升为确认；基线对框架状态的九项断言与当前 design 一致。下列发现中只有 R1-F01 属实质缺陷（中），其余为精度或表述问题，可在 v2 重封时一并处置。

## 逐项发现

### R1-F01 · 中 · 三条故事补充项被整体降级为「建议/待定」，原文并未标建议

- 对象：`requirements/source-coverage.json` `story_supplements` X25、X26、X27（L4644-4697）；`domain-reading.md` L76-78；`compact-inventory.md` L239-241。
- 原文：用户故事 L486「如果旧设备丢失或不再使用，用户从可信入口收回相应访问与新工作资格」；L475「帮助与诊断入口不暴露密钥或无关私人内容」；L493 前两句「重装客户端不等于删除账户资料；停止续费不应让尚未披露的持续费用继续产生」。
- 问题：三行都在故事的正文流程或异常段，故事本身没有标「建议补充」（S23 完成标准只把「账号退出与商业服务细节」标为建议）。X26 锚定 M05.11、M17.7 两条非建议功能，仅因附带 M15.6 就整条标 `suggested_or_deferred`；X25 的「不暴露密钥」已由非建议的 M17.6 承接，仅「帮助入口」部分归建议项 M18.8；X27 前两句分别对应非建议的 M08.9/M18.5 与 M16.10，只有第三句是显式待定。当前标法把非建议要求降级，与 `classification_note`「禁止整项提升为 confirmed」的对称原则不一致（也不应整项降级）。
- 最小修订：仿 M12.5 的 `status_parts` 拆句标状态；或 X25/X26 改 `source_requirement` 并在 `relation` 注明「锚点之一为建议项」，X27 拆为前两句 `source_requirement`、第三句 `suggested_or_deferred`。corrections-v2 已提议去掉 S23:L486 对 M15.6 的弱关联，但未触及 X26 的状态字段，建议一并补入。

### R1-F02 · 低 · 已封存正文含三处引用行号偏差，corrections-v2 已识别但未应用，seal-v1 锁定的是偏差版本

- 对象：`domain-reading.md` L46、L69；`compact-inventory.md` L232；`seal-v1.json`。
- 核对：产品定义 L225 是「### M05」标题，「这是核心产品能力」在 L227；「与同步的区别」在 L252（不是「L250-L254 附近」）；「存下材料不等于形成长期记忆」在 L79（材料行），L80 是记忆行。
- 问题：偏差本身不改变结论，但封存件宣称「精确行号」，且 compact-inventory 复制了同一偏差。
- 最小修订：应用 corrections-v2 并重算 seal-v2；或在 seal-v1 加一行 errata 指向 corrections-v2。

### R1-F03 · 低 · 「未找到直接故事证据」清单含一项误报，三条弱关联待清理

- 对象：`source-coverage.json` L4813-4824；`domain-reading.md` L15。
- 核对：M07.10「干预与真实结局」有 S19:L414「撤回未成功或仍在处理时如实说明」和 S20:L428「正在进行的外部动作是否可以停止…按实际情况交代」直接证据。M01.5←S16:L353、M08.5←S22:L470、M15.6←S23:L486 为弱关联，corrections-v2 已列出。
- 最小修订：同 F02，随 v2 重封处理，10 项改为 9 项。

### R1-F04 · 低 · 三条故事独有禁止结果未进入 27 项补充清单

- 对象：`story_supplements`；对应 narrative units S20:L431、S12:L266、S02:L52 均保留整句但 `supplement_ids` 为空。
- 原文与功能表差距：S20:L431「撤权失败不能显示成功」，M17.7 只写阻止后续使用与不声称追回，未写失败不得显示成功；S12:L266「结果尚未到达时，助理不把分派成功说成分析完成」，M05.7 写的是「选择未确定时不提前显示为已执行」，分派已受理与已完成是另一组区分（domain-reading L23 的领域读数提到了，但没有编号落点）；S02:L52「修正未成功不能显示已生效」，M01.7 只要求「说明修正是否成功」。
- 说明：报告已声明 27 项不宣称穷尽，整句原文也已保留，故不构成丢失；但这三条是持久化/分布式正确性主线最会用到的「不得假成功」类要求，建议补为 X28-X30。

### R1-F05 · 低 · 基线对 registry README 的描述不够精确

- 对象：`framework/baseline.md` L11「README仍写63，属导航统计陈旧」。
- 核对：`registry/README.md` L14/L127 表格确写 63；但 L167（D-069 段）已写「catalog当前64 accepted」。catalog.json 实际 64 条 `status: accepted`，基线数字正确。
- 最小修订：改为「README 一览表仍写 63，末段 D-069 已记 64」。

### R1-F06 · 低 · 基线未逐契约区分「已接受版本」与「当前实现所钉版本」

- 对象：`baseline.md` FC-02、FC-03 契约行（如 `capability.account-identity` v1/v2/v3、`capability.organization-governance` v1/v2/v3 均列 accepted）。
- 问题：基线在 L11 正确声明「不按最大版本自动升级消费者」，FC-02 也点明 OG3 未实现；但 FC-03 紧接「治理实现与限定真实中心旅程已交付」，读者可能推为 v3 已实现。realization README 记录 account-identity 按 v2 实现、v3 仅有设计。
- 最小修订：契约行加「实现所钉版本」一列或一句（例如 AI 实现钉 v2，v3 仅设计接受）。这是表达问题，不是断言错误。

### R1-F07 · 低 · `confirmed` 标签与来源的「本轮确认」标记同名，易混读

- 对象：`features.json` 的 `confirmed_or_suggested`（159 项 `confirmed`）、`source-coverage.json` `feature_statuses`。
- 核对：来源有四种标记（延续、既有目标、本轮确认、建议补充），标记在模块级；159 项把前三种合成一个词 `confirmed`。domain-reading L11 与 features.json `status_meaning` 均已作免责，compact-inventory 已改用「非建议」。
- 最小修订：字段值改为 `non_suggested`，或保持现状但在 seal 说明中写明该词不是来源的「本轮确认」。

### R1-F08 · 低 · compact-inventory 补充项表格分隔行列数不符

- 对象：`compact-inventory.md` L213-214，表头 4 列、分隔行 3 列，Markdown 渲染会破。纯机械问题。

## 通过且重要的边界（已核对成立）

- **计数与可追溯**：18 模块 165 功能逐模块加和为 165；23 故事 ID 与原文一致；G01-G05 引 L535-553、待定 1-6 引 L580-585，原文逐字一致；输入 SHA-256 与行数三处报告一致。
- **建议分类**：产品定义中含「建议补充」的功能行恰为 M12.5（混合）、M15.6、M15.8、M18.7、M18.8、M18.9，与 159/1/5 一致；M12.5 按 `status_parts` 拆句，未整项提升。
- **基线九项断言**：catalog 64 条全 accepted；realization 节点 50 个（design.md 逐目录计 50，与 D-073 记录一致）；Core 221/221 含 6 项 NonConnector 部分、90 外部义务与 Connector 16 项未签、6534 适用回归；治理 1926 通过/34 跳过、47 项独立制品旅程，均见 realization README 与节点原文；PF-015 当前 rev 20，D-074 精确接受 rev 13，rev 14-20 全部为 2026-09-29 产品修订；Connector 在 PF-002 rev 31「Connector」段与 §九、PF-015 §6.23 与 §九均明写搁置，`packages/core/connector` 无 package.json；Engram 在 PF-007 §6.13 标题即写「占位声明，不作实现交付要求」；SYS-DEPLOY 首版单机、SYS-KERNEL 2026-09-28 仅 Cordis、SYS-LLM 经 OpenRouter、D-025 钉 4.0.4，原文一致。
- **未把 accepted 当 implemented**：基线对 assets/tools/model/session/agent-loop/infra 各组「未建包」的说法与源码 `packages/*/*/package.json` 实际存在集合一致（仅 core 18 包、util 2 包、tenancy 5 包、frontend 3 包、infra 2 包、apps 2 个存在）。
- **未引用 design_legacy**：两份报告与 JSON 的 method 均声明只读当前 design，抽查来源路径无 legacy 引用。
- **规模前提**：一万用户仅记为外部输入，`scale_is_framework_capacity_commitment: false`，与任务前提一致。

## 审阅覆盖与未读范围

**已读**：domain-reading、compact-inventory、corrections-v2、seal-v1、input-manifest 全文；baseline.md 全文 604 行；source-coverage.json L1-1345 与 L4208-4827，另定点 S02:L52、S09:L203、S12:L266、S19:L414、S20:L431；features.json 定点 M12.5 与状态计数；compact-capabilities.md FC-01~07、compact-capabilities.json FC-09/13/24/26；framework-capabilities.json 头部与 connector 节点观察。原始需求：阅读说明全文、用户故事全文 512 行、产品定义 L1-140、L222-256、L386-407、L450-587 及「建议」全文检索。框架：SYS 约束全文、registry README 与 catalog 状态计数、realization README 与节点目录计数、D-025/D-073/D-074 全文、PF-007 §6.13、PF-002 Connector 段与 §九、PF-015 连接件相关行与 changelog 标题、全部 PF README 的 rev。

**未读**：features.json 其余正文、source-coverage.json L1346-4207 的逐行关联（依赖其机械检查结果，未逐条复核 224 行的 feature_ids 合理性）、stories.json、两份 build 脚本、dependencies.md、saas/、execution-topology、orchestration、mapping-contract；各 PF design 正文除引用行外未通读；record/evidence 各运行 README 未打开，证据数字取自 realization README 与节点原文的转述，本次未重跑任何检查。