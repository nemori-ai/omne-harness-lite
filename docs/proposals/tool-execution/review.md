# 独立评审与处置

[提案索引](README.md)

评审：architecture-reviewer（只读），2026-09-14，对象为 HUB 分支 `design/dsh-core-adoption`
提交 `ed1ef8b` 的本提案全部文件、[tools 验证范围](../../../spec/capabilities/tools/verification.md)
与新登记的两个形式任务；无比较基线。评审员未运行 TLC，未重算哈希。处置在同一分支的
后续提交完成；评审引出的决定点与用户裁决对照见 [README 决定点表](README.md#评审后的决定点用户裁决2026-09-15)，
正文按裁决写。

## 阻断接受

| 编号 | 发现 | 处置 |
|---|---|---|
| B1 | Run 不可恢复失败时级联缺行：未答 `human` 请求与在途前台调用在 `failed` 下无归属，模型把 failed 与 completed 合并且只在无阻塞调用时可达 | 已修，按用户裁决 U-43：级联表新增"Run 不可恢复失败 → failed"行（未准入取消；已准入调用与未答问题保留，等待位置释放，结算按 SE-14 C 列触发新 Run）；模型新增 `RunFail` 与动作性质 `FailKeepsHuman`；RN-02 措辞进缺口表；场景 TS-18；invariants H-3、T-4 更新 |
| B2 | `request_approval` 的一次性决定如何绑定后续调用未定义，T-9 对 PF-005.C2/C10 的覆盖不成立 | 已修，按用户裁决 U-44（评审建议 b 的方向）：Agent 发起的批准是提示层语义，答复以工具结果呈现，不被门消费；HITL 工具只有 `ask_user` / `request_approval`；T-9 收窄到系统审批；requirements 标出 PF-005.C10 中无系统机制承接的半句待用户确认措辞 |

## 应修后接受

| 编号 | 发现 | 处置 |
|---|---|---|
| S1 | `interrupt_then_run` 对 `human_wait` 的处置与 HD-04 / RN-04 冲突且未入缺口表 | 已修：改为与 interrupt 行相同，保留请求；不再需要缺口 |
| S2 | `serial` 并发语义与 RD-09 的串行默认不一致 | 已修：schema.md 对齐 RD-09（前一调用视图不再阻止收束即放行） |
| S3 | 模型的结算交付维度不忠实于 SE-14（前台调用在 running 时结算被路由为 context；context 可唤醒等待中的 Run） | 已修：`Route` 以"曾阻塞 Step 的调用在 Run 活动时 → continuation、`human_wait` 只在 Run 已等待时 → continuation、后台 → context"建模；`Consume(context)` 限定 running；证据说明与验证页披露 |
| S4 | invariants.md 对模型范围的声明超出实际模型；验证页数字与日志不符 | 已修：T-4 / H-3 证据列与证据义务按实际模型改写；验证页数字取自最新重放日志 |
| S5 | `unavailable` 作为结算结果在契约间不一致，未登记缺口 | 已修：维度 A 与结果形状加 `unavailable`（执行前，不消耗 attempt）；缺口表新增 TL-07 行 |
| S6 | "Run 执行预算是最终刹车"没有拥有者与触发者 | 已修，按用户裁决 U-45：Run 与工具状态机解耦，删除 Run 预算刹车；有效阈值 = min(声明, 系统上限)，`keep_waiting` 等到自然结束或用户 stop；TL-10 的 Run 预算项与 `stopMarginMs` 进缺口表删除 |
| S7 | `HumanToolPlugin` 放在 HD 包会形成 HD ↔ TL 依赖环；HD.answer 结算调用的端口未定义 | 已修：移到新成员 `packages/tools/human-tool`；HD 下一版增加"请求结算接收器"端口（HD 定义、human-tool 实现），HD 不 import TL；cordis.md 依赖图、装载效应、归属表更新 |
| S8 | 结算同批的组合者未指明 | 已修：`ToolExecutionLink` inject `omneSession`，组合 owner terminal + `prepareTerminal/checkTerminal` + accept；转移表与 cordis.md 更新 |
| S9 | 缺口表遗漏 HD 与 run-driver 侧条款及受影响消费者 | 已修：缺口表新增 HD v1、run-driver v3、run v1、SE-12、MC-07 行，CD 行列出受影响消费者 |
| S10 | `request_consent` 与 HD 提供者现状不一致 | 已修，按 U-44：该命令删除；能力授权申请由 `ask_user` 表达需要、授予走系统发起的专属同意流程 |
| S11 | requirements.md 与 schema.md 关于"暂行"声明矛盾 | 已修：以 schema.md 为准修正 PF-007 行 |

## 建议

| 发现 | 处置 |
|---|---|
| 级联表缺"未启动"列；用户对 `human_wait` 调用的单次 stopCall 只在模型有 | 已修：级联表加"未启动"列；内建工具第 4 步加单次 stopCall；场景 TS-19 |
| interrupt 行的 detach_in_flight 等待没有语义收益 | 已修：改为直接 stop，interrupt_then_run 行保留等待 |
| terminal 与 detach_in_flight 竞争未在正文说明 | 已修：转移表后补一段 |
| detach 请求缺进展性质 | 已修：TP-5 |
| hooks S5 求值位置应在门外 prepare；ask 原因应进 HD 请求内容 | 已修：cordis.md hooks 表 |
| F-1 封锁通道的后果未说 | 已修：frames.md 去重行与 F-1 |
| `mergeable` 无消费者 | 已修：从声明与缺口词表删除，留到出站流阶段 |
| 跨域 owner 前须补的义务 | 已修：README 未决项与证据说明 |
| 验证页应注明 `-deadlock` | 已修 |
| PF-003.C1 读面授权无性质落点 | 已修：F-3 扩为帧、调用状态与控制读面 |

## 转给用户的决定点

评审列出六项，用户 2026-09-15 裁决：1 → U-43（保留问题，新 Run 接上）；2 → U-44（批准是
提示词，无门绑定）；3 → 已按 HD-04 / RN-04 保留请求；4 → U-45（无 Run 级预算）；5 → U-46
（不能否决）；6 → 随 U-44 删除。用户提出的迟到结果投影 → U-46 确认。

## 评审未验证项的现状

- 重放已在处置后重新运行，`results.json` 的哈希对应当前文件；`source_commit` 仍是重放时的
  HEAD（提交本身在重放之后），身份以哈希为准。
- 需求快照 `18026b2` 的说明未变。
- Ajv profile 与投影单测、帧与媒体场景、`human` 工具崩溃注入仍是实现阶段义务。
- DSH `dsh-tool-ask-user` / `dsh-user-questions` 词汇的逐项对应留给接受后的 human-tool 设计。
