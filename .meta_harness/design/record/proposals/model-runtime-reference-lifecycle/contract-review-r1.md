# 成组契约候选首轮独立评审

2026-09-29。对象为提交 `3f597c1820ad4dd364a303c19a31264b5b07c0f5`（父提交 `4edf6cdc9d2a5fddaf42c047dadc5eac585a706a`）的 RT11/MR10/MS7/CA3。两位只读 reviewer 分别按 architecture-reviewer 和 spec-reviewer 职责评审，均核对 [七份锁定语义摘要](../../evidence/2026-09-29-formal-model-reference-candidate/semantic-snapshot.json)。未改文件，未运行测试或形式工具，不接受、不释放实施。

本页记录实际结论与待修义务；正文后续修订必须另给新快照，不能将本轮结论当成新字节的结论。此前 r1/r2/r3 是架构方向的不同增量定点检查；本次是第一份完整契约批次的首轮评审，不是同一未修改基线反复评审。

## 架构语义评审：三个阻断

| ID | 证据与最小反例 | 需要关闭的义务 |
|---|---|---|
| A-B1 | MR10 S47、RT11 S75/S86 要 ready→final 连 reply 完全相同，MS7 S9 要 final.reply 与 AssistantMessage 逐 JSON 相同；但 PF012 rev21 §5.8、LC6 S23、modality-projection v2 S20–21 允许且要求落盘前系统转换件挂派生表示。图片回复已 ready 后成功添加 renderings 的正常链没有合法 persisted 终点 | 区分不可变模型事实与合法消息派生，明确最终响应关系及唯一责任方；同步 MR10 S41–45/RT11 S77–81 的原 outputGroup 摘要与固定投影语义。不能只放松 reply 相等而假定摘要忽略派生字段，也不能重造旧校准 |
| A-B2 | RT11 S33、S72 的普通新 attempt 全会话对账仍要求旧网络/门/写者实际停止且无 live 成功出口；PF012 rev21 §5.7/§6.13、PF013 rev16 §5.13 要求仍活着的模型执行重新取得句柄。原 consumer 消失、新 attempt 起动时会永久 unavailable 或诱使停止本应延续的执行 | 将正常识别/重新取得与真正失联追补分开，live 有无副作用成功出口，实际停止/唯一恢复权仅约束追补分支；不要求实现完整 Session/Run |
| A-B3 | MS7 S53–54 强制所有 undispatched 为 rejected creation；RT11 S28 可先发布 accepted created，S29 仍会因首次发前凭据不可得或 modality_mismatch 写 undispatched | 分清创建即拒绝与成功创建后零发送终结，保留原 CallKey/creationKey/accepted 内容和原采用依据；同步形状、判重和认回 |

未另列结构性非阻断。既有承载在本轮读取中成立：Session 日志 marker 为唯一事实发布点、内容存储只保留不可变载荷；CA3 以原 ResponseId 选择 ready/final 一次、补账不迁移；消费 release/abort 不取消；Map 缺席不证明失联；interrupt 仍命令，dispatch/acquire 交原结果，partial reply/delivered 与硬杀未持久边界保留，ref 不赋予 persisted 写权。

未发现新增产品裁决，也无改选 B/C 或建立通用 registry、完整 Session/Run 的理由。实际 G38–40 的权限、停止、内容存储、回收和 O(1) I/O 未验证。新模型尚未覆盖派生消息链、普通 live 对账或创建后首次发送失败，须补最小场景，不能拿原模型无反例代证。

## 规格表达评审：六个阻断、两组非阻断

| ID | 等级 | 证据与触发 | 需要关闭的义务 |
|---|---|---|---|
| S-B1 | 阻断 | MR10 S4/S8、RT11 S5 仍要求每次发出恰一条 final ModelResponse；MR10 S39/S46 又说 Pending 非 final；RT11 S86 允许永远无人处分 | 说明唯一响应事实如何由 ready/final 两阶段承载，禁止为了满足旧必 final 措辞伪造 consumed；同步序列、恢复、账 |
| S-B2 | 阻断 | 同 A-B3；open成功后凭据撤去再重试同creationKey，accepted与rejected来源冲突 | 同 A-B3；不得让实施者重裁创建结果 |
| S-B3 | 阻断 | RT11 S8 要 Run 中断意图 fenced，S68 中断意图行写“同上”，其紧前 ready 行已是 unfenced | 写全中断意图的 fence 条件与 attempt，消除错位指代 |
| S-B4 | 阻断 | RT11 S33⑤闭合返回集合未含 open，新created-only行返回open | 完整返回集合、消费者与实例一致 |
| S-B5 | 阻断 | RT11 verification 将旧attempt仍可opened映射到OpenedOrder；但给CommitOpened增 `currentAttempt=1` 就会禁止它，现有四项配置断言仍可能全过 | 增可失败的精确检查或收窄模型覆盖并登记缺证，不以硬编码状态吸收性质 |
| S-B6 | 阻断 | 四契约“当前设计依据”仍混旧rev；例如RT入口PF001/004/009/015为23/13/8/13而当前25/20/9/20；CA有PF002 rev20、PF006 rev19而当前32/23 | 逐项重核实际消费范围并明确当前依据与历史来源，不能只批量替换数字 |
| S-N1 | 非阻断 | MS7 examples.md 的旧undispatched正例缺creationKey/payload，按本次Schema应拒；57个JSON实例未覆盖该Markdown例 | 同步规范正反例，保持单一拒绝原因 |
| S-N2 | 非阻断 | MR10 S40仍指MS6，入口/Schema用MS7；RT11 S8文字MS6链接MS7，S49④构造MR9 | 扫清现行精确坐标的双重声明，历史接受坐标不误替换 |

无新增产品选择事项；边界判断不由规格表达评审替代。该 reviewer 只读核对了新模型、九负控与实际日志，未独立复跑；运行时未采输入hash的局限如实保留。未核真实提供者、物理停止、持久回收、授权或性能；852旧冻结不变采用已有检查，未冒称逐项独立重算。

## 设计主线处置

全部问题接受为本候选需修义务，尚未关闭。A-B2/A-B3 与表达一致性可先并行修订；A-B1 的最小候选是保留原response事实、限定持久消息上的合法单调派生，并让摘要不匹配沿已有校准失效规则处理，仍待精确关系审视，**本页不采用该方向**。不让 realization 或 implementation 任选解释，修后另封第二份契约快照。
