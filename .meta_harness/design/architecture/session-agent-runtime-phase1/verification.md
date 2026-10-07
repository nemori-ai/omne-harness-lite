# 验证责任、范围与实施门

形式模型、负控配置及可复跑探针已归对应包verification。具体命令与有限前提分别见仓库坐标`packages/core/session-runtime/verification/README.md`、`packages/core/model-message-projection/verification/README.md`、`packages/session/session-runtime-local/verification/README.md`（均为设计准备槽，尚非workspace成员）。运行日志和评审过程只留工作树tmp；本页不引用record历史目录。

| 义务 | 唯一责任拥有者 | 本阶段证据／实施后必须补 |
|---|---|---|
| 受理事实／资格同提交、finish/input、attempt发起栅栏、迟到归因、无通知进展 | Session协调 | SessionWork有限TLA模型及去保护负例；真实storage同事务／故障和重启组合必须补 |
| 同真实AtomicStorage实例参与、SQL约束／回滚 | storage定义合规＋Session/日志provider组合 | 既有atomic conformance及SQL探针；实际两个provider参加接口／migration不能由原语探针替代 |
| 原模型／工具独立执行、Agent撤除／注入换代不重发、真实drain | assembly-lifecycle＋Session/执行组合 | Cordis4.0.4独立Context/提供者换代探针；真实执行服务原call/费用/pending close故障验收必须补 |
| 非消息不入模型、冷／热一致、引用旧块、规则失效、成本 | projection定义＋Session cache provider | 独立参考选择/操作计数与失效探针；生产类型校验/序列化payload/内存界/profile必须补 |
| 当前身份／定义／配置、真实OpenRouter | 用户入口与合法装配拥有者 | 明确施工输入和验收脚本；本设计不发模型HTTP或声称认证已完成 |
| runtime context精确行为保持 | context定义／provider，SQLjournal组合 | 复用原RC与provider义务；SQL切换后重跑原source generation/unknown append/replay/drain用例 |
| 模板／公开入口／Cordis规范 | 每个真实成员与装配应用 | 当前template 1.0.0静态盘点；新包建成后build/typecheck/test和实际IC检查，模板通过不证明行为 |

有限模型前提：两个输入、两个Run、一个调用、至多两attempt；抽象原子提交／可信访问，公平协调调度。模型不含SQL实现、网络、凭据、源代际、队列优先、完整六段Loop或外部效果恰好一次。
负例必须分别移除同提交、发起栅栏和新输入收尾核验，观察真实counterexample；若负例也通过，模型不能作为该性质的证据。
原模型／工具已采用模型继续按精确资源执行，本模型不替代first-token／ACK custody／官方准入／成本校准等原证明义务。

其中SingleActive只检查active当前指针属于已创建且未终结Run，模型用单指针表达选择，不能证明真实存储不存在第二个未终结Run。ResultsAttributed仅检查已结算调用的原Run属于created，不证明完整多owner／租户／费用归因。AdmissionConserved、NoOldIssue与NoStaleFinish已有去保护反例；前两项较弱检查没有被提升为完整性质证明。实际并发唯一性、完整归因和持续追加进展仍需真实provider故障验收。

## 实施前与接受前

技术选择／表达／施工计划分别独立评审，评审不是接受。需获得本次新边界与改变承诺的限定采用后，才实施该范围；本轮物理迁移不替代采用。
未迁冻结规范不就地改字；逐条源／消费者／验证义务切换、删后核验、精确采用范围可在当前拥有者定位才退役旧源。实现仅按已接受承诺长出。
实际交付按风险入口定级，跨owner同提交、租户／凭据和在途执行是高风险热点；实施交付需独立实现评审与真实组合验收，不能以本轮设计检查接受15卡。

## 诊断与配置

每个unknownCommit、blocked recovery、pending close、stale projection标记带操作／Session／Run／call/来源版本及阶段；公开诊断不能含消息正文、密钥或凭据。
指标包括未承接工作数、最旧义务、扫描进度、重复受理、fence拒绝、失联对账、未完成关闭、缓存命中/失效理由与线性工作量；没有来源数值预算不造SLA。
