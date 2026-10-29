# 条款、动作与实现义务

本表引用 [SPEC](../../../SPEC.md) 的现行条款，不声明产品已有对应实现。TLA 原子动作表示提供者必须兑现的提交边界。只读准备、原事实发布、Session 后果发布和调用者认回分别建模。

| 条款 | 模型动作与性质 | 实现必须提供的对应证据 |
| --- | --- | --- |
| FR-01、FR-02，完整目录与历史批次 | Frontier/FrozenActive 的 Capture、ReadDirectory、DirectoryReady、ReadPage；HistoryCoverage、ExactBatch | 同根可信 Q、完整原交入关系、历史 execution-to-Run、连续原前缀与批界。缺页、未知和完整空关系不可互换。纯 decide/project/reduce 独立拒绝缺项及旧材料 |
| FR-03，原事实与解释提交分离 | PublishTake 后再 PublishPrefix；CursorSound、ExactBatch | Agent 原 taken 不等于 Session SE14。解释后果、进度和原操作答案同提交，失败不撤销原 Agent 事实 |
| FR-03，捕获集合与重算 | CapturedDone 后 Refresh；CapturedPrefixRetained | 一个 SE14 缩小 Q 后仍完成原 E 的必要前缀。再取最新根与目录，只补新增关系及必要后缀 |
| FR-03、FR-04，最终竞争 | PublishRelease、FinalConflict、PublishTake、PublishNormalEnd；NoFalseRelease、HistoryCoverage、NoPostTerminalTake、WholeReleaseBatch | 在真实共同发布点重核根、当前 grant、Run、完整范围与唯一终态。Agent taken 先胜出使旧发布失效，Session 先胜出拒绝旧 grant 的新 taken。不能只有 CAS 而缺纯层材料核验 |
| FR-04、I-F3/I-F4 | FreezeActive 与 FrozenActive 的 Accept/Admit | active freeze 不取消 Run。冻结后仍 active 的合法受理可扩张 pending，并与原目录/taken/前缀链竞争。原 admission 与目录共同建立，不以 SE35 为空推断未交入 |
| FR-04、PM-02、PA-09 | PM02 的 InvokeReject、Prepare、Publish、Conflict；AtomicRejection、FirstOnlyRejected、RemainingExact | 原 invoke invalid 且 execution 未创建。首条只 SE35 rejected，failed、首条资格解除、其余精确 SE38 和原答案同批。未冻结时保留其余 pending |
| PA-07、EC-02 | Frontier/PM02 的 FailBefore、Query、ReplayOriginal；UnknownSound、AnswerSound、ReleaseAtMostOnce | 发布前失败没有业务结果，提交后丢答复保持未知，以原身份认回。重试不得重复终态或解除 |
| FR-05 | Frontier 的 head/cursor 分离；HeadCursorSeparate | 使用同根真实 head revision/receipt，事件序号只推进 readThrough。原 fact/result.source 与 head evidence 分开。FrozenActive 没有重建这项性质 |
| PA-08 | CancelWindow、TerminalStable、独立正常解释者 | frontier 停在 ended 前，正常解释者独立形成完成终态，按唯一先成立者裁定。取消准备不得自行解释 ended 抢占窗口 |
| FR-07、SL12–14、EC-01 | GapIsolation 的 DiscoverGap、PublishNormal、新命令；SessionIsolation、OldPreparedIsolated、NewInterpreterIsolated、NewCommandIsolated | 发现权威 gap 与共享 Session 门生效在同一线性化点。旧准备即使 root 仍匹配，也须在实际 publish 重核门。门不能只是单个准备对象的局部字段 |
| FR-07，保管与读取 | LateCustody、Custody、Inspect、QueryOriginal | 合法保管按独立资格继续，不恢复业务 grant 或 Session 投影。读取与认回要求当前读取授权及可用原答案。不得把隔离当成原事实删除 |
| FR-07，成本 | Frontier 的 RelevantReads | 仅约束 ReadPage 的 execution 集合。Capture 抽象保存 raw/head，不能据此证明真实 load、物化、字节预算或 I/O 成本 |
| FR-06、FR-07 的完整归一 | 本模型只用抽象普通后果代表部分事件 | Model/Tool producer、purpose、attempt、版本、Tool intent/关联/等待、控制和压缩下界需要纯层、adapter 与实际入口证据，不由四模型代替 |

P-5 的正控只检查已获准收束后的 frontier 子机制，前提是恢复重试达到策略上限、精确采用仍不可读、原 execution 没有 ended、taken 前缀和目录完整可读。模型未证明该前提可同时满足，也未证明最终资格和新 ended 的核验。

GapIsolation 假设权威缺口可被可靠识别且隔离门立即生效。持久 quarantine、重启、修复和解除权限归存储及对应组合拥有者。FrozenActive 以未隔离、目录完整和材料可读为前提，尚未验证它与 GapIsolation 的完整组合。

四模型的观察字段只记录已发生的事实，不作为产品状态或业务守卫。Frontier 的单调违规位压缩不适用于新增历史查询性质。负控 `negative-no-grant` 同时绕过 root、grant 与 active，不能用它宣称单独 grant 条件敏感性。
