# 条款、动作与实现义务

本页对照 `frontier` 下四个有限模型与包组规格。模型检查会话历史前缀、冻结解除与权威缺口的有限并发行为，依据规格的同日志解释、新 Run 与冻结的条款与 I-F3、I-F4、SE-14。四个模型分别检查不同的有限接缝，没有形式 refinement 或完整直积证明，结果不能相加为完整组合或产品实现证明；TLC 检查有限状态，不是定理证明。每个模型的 `cases.json` 逐配置列出用途（正控、负控、见证、敏感性）、必须保持的性质与负控必须命中的性质，它是配置预期的唯一出处。

| 模型            | 范围与前提                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontier`      | 原承接与 Session 解释分离、完整捕获前缀、最终根、终态与解除。一个本租户会话、至多两个输入、两个顺序 Run；两个相关执行、一个无关旧执行、一个仅提供错误材料的外租户执行 |
| `pm02`          | 首条发起被拒收且没有执行时，冻结精确解除其余输入。一个 active Run、至多三个输入，两个准备者                                                                           |
| `gap-isolation` | 权威缺口生效后，旧准备、新解释者与新命令受共享隔离门约束。两个执行、一个权威缺口                                                                                      |
| `frozen-active` | 已有执行的冻结 active Run 在准备期间接收新输入。一个 Run、两个输入                                                                                                    |

四个模型都假定原日志不可变、连续，目录完整可验证，单个发布动作原子成立；没有搜索深度截断，关闭死锁检查；进展需要有限相关历史、材料最终可读、公平调度与最终提交机会，不证明无条件活性。观察字段只记录已发生的事实，不作为产品状态或业务守卫。

覆盖边界：`frontier` 在外部合法收束的前提下检查前缀机制，不覆盖新 Run 的首条拒收，也不独立覆盖冻结后新受理的完整链与共享缺口门；`pm02` 不含已有执行的一般前缀、后继 Run、完整恢复资格；`gap-isolation` 不含持久隔离、重启、修复与解除权限；`frozen-active` 没有完整的恢复资格、真实 head 修订、动态保管、未知、恢复、后继 Run 与缺口门的组合证明。

TLA 原子动作表示提供者必须兑现的提交边界。只读准备、原事实发布、Session 后果发布和调用者认回分别建模。

| 条款                             | 模型动作与性质                                                                                                                        | 实现必须提供的对应证据                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01、FR-02，完整目录与历史批次 | Frontier/FrozenActive 的 Capture、ReadDirectory、DirectoryReady、ReadPage；HistoryCoverage、ExactBatch                                | 同根可信 Q、完整原交入关系、历史 execution-to-Run、连续原前缀与批界。缺页、未知和完整空关系不可互换。纯 decide/project/reduce 独立拒绝缺项及旧材料                |
| FR-03，原事实与解释提交分离      | PublishTake 后再 PublishPrefix；CursorSound、ExactBatch                                                                               | Agent 原 taken 不等于 Session SE14。解释后果、进度和原操作答案同提交，失败不撤销原 Agent 事实                                                                     |
| FR-03，捕获集合与重算            | CapturedDone 后 Refresh；CapturedPrefixRetained                                                                                       | 一个 SE14 缩小 Q 后仍完成原 E 的必要前缀。再取最新根与目录，只补新增关系及必要后缀                                                                                |
| FR-03、FR-04，最终竞争           | PublishRelease、FinalConflict、PublishTake、PublishNormalEnd；NoFalseRelease、HistoryCoverage、NoPostTerminalTake、WholeReleaseBatch  | 在真实共同发布点重核根、当前 grant、Run、完整范围与唯一终态。Agent taken 先胜出使旧发布失效，Session 先胜出拒绝旧 grant 的新 taken。不能只有 CAS 而缺纯层材料核验 |
| FR-04、I-F3/I-F4                 | FreezeActive 与 FrozenActive 的 Accept/Admit                                                                                          | active freeze 不取消 Run。冻结后仍 active 的合法受理可扩张 pending，并与原目录/taken/前缀链竞争。原 admission 与目录共同建立，不以 SE35 为空推断未交入            |
| FR-04、PM-02、PA-09              | PM02 的 InvokeReject、Prepare、Publish、Conflict；AtomicRejection、FirstOnlyRejected、RemainingExact                                  | 原 invoke invalid 且 execution 未创建。首条只 SE35 rejected，failed、首条资格解除、其余精确 SE38 和原答案同批。未冻结时保留其余 pending                           |
| PA-07、EC-02                     | Frontier/PM02 的 FailBefore、Query、ReplayOriginal；UnknownSound、AnswerSound、ReleaseAtMostOnce                                      | 发布前失败没有业务结果，提交后丢答复保持未知，以原身份认回。重试不得重复终态或解除                                                                                |
| FR-05                            | Frontier 的 head/cursor 分离；HeadCursorSeparate                                                                                      | 使用同根真实 head revision/receipt，事件序号只推进 readThrough。原 fact/result.source 与 head evidence 分开。FrozenActive 没有重建这项性质                        |
| PA-08                            | CancelWindow、TerminalStable、独立正常解释者                                                                                          | frontier 停在 ended 前，正常解释者独立形成完成终态，按唯一先成立者裁定。取消准备不得自行解释 ended 抢占窗口                                                       |
| FR-07、SL12–14、EC-01            | GapIsolation 的 DiscoverGap、PublishNormal、新命令；SessionIsolation、OldPreparedIsolated、NewInterpreterIsolated、NewCommandIsolated | 发现权威 gap 与共享 Session 门生效在同一线性化点。旧准备即使 root 仍匹配，也须在实际 publish 重核门。门不能只是单个准备对象的局部字段                             |
| FR-07，保管与读取                | LateCustody、Custody、Inspect、QueryOriginal                                                                                          | 合法保管按独立资格继续，不恢复业务 grant 或 Session 投影。读取与认回要求当前读取授权及可用原答案。不得把隔离当成原事实删除                                        |
| FR-07，成本                      | Frontier 的 RelevantReads                                                                                                             | 仅约束 ReadPage 的 execution 集合。Capture 抽象保存 raw/head，不能据此证明真实 load、物化、字节预算或 I/O 成本                                                    |
| FR-06、FR-07 的完整归一          | 本模型只用抽象普通后果代表部分事件                                                                                                    | Model/Tool producer、purpose、attempt、版本、Tool intent/关联/等待、控制和压缩下界需要纯层、adapter 与实际入口证据，不由四模型代替                                |

P-5 的正控只检查已获准收束后的 frontier 子机制，前提是恢复重试达到策略上限、精确采用仍不可读、原 execution 没有 ended、taken 前缀和目录完整可读。模型未证明该前提可同时满足，也未证明最终资格和新 ended 的核验。

GapIsolation 假设权威缺口可被可靠识别且隔离门立即生效。持久 quarantine、重启、修复和解除权限归存储及对应组合拥有者。FrozenActive 以未隔离、目录完整和材料可读为前提，不含它与 GapIsolation 的组合。

四模型的观察字段只记录已发生的事实，不作为产品状态或业务守卫。Frontier 的单调违规位压缩不适用于新增历史查询性质。负控 `negative-no-grant` 同时绕过 root、grant 与 active，不能用它宣称单独 grant 条件敏感性。
