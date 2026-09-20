# Review、场景与验证边界

## 建议优先裁决

1. **粒度**：Turn = OMNE 输入实体；Run = 逻辑执行；Step = DSH 模型/工具周期；Action = 副作用槽位。
2. **动态边界**：Profile 内容版本绑定、模板渲染触发时机与结果生效范围仍待决定；
   请求组装不等于动态模板重新求值，不能再将每 Step 重渲染视为默认要求。
3. **Prompt 已确认要求**：独立创建、管理、发布并被多个 Agent 引用；分为固定纯文本的静态部分
   与使用受限上下文状态变量的自定义模板动态部分。session run start hook／插件渲染是业务触发示例；具体协议待定。
4. **工具形态选择**：模型要求/等级适配用共享 ComponentRef + ToolModelRequirements；多个匹配默认拒绝，
   具体业务选择政策另行定义。原仓未提供完整选择实现。
5. **Session/Run 并发**：一个 Session 至多一个活动 Run；对同时执行需求通过新 Session/显式派发扩展。

这些是第一版提案，用户 review 不作为本轮生成提案工作的阻塞条件；接受后再冻结规范性版本。

## 跨模型验收场景

| ID | 初始条件与动作 | 必须可观察的结果 / 性质 |
|---|---|---|
| P1 | Step A 已冻结；工具贡献插件卸载 | A 的证据不改；B 重新组装剔除该工具与依赖指导；A 未发出的调用按代际/治理规则拒绝或 drain |
| P2 | 模板缺必需变量或贡献同 key 冲突 | AssemblyRejected，零模型 dispatch；不能用旧提示/空值兜底 |
| P3 | 同 Step 网络失败后重试，期间外部状态改变 | slot/snapshot 不变，只有新 try；需变更请求则新 Step，有变更依据 |
| P4 | 一个租户引用另一个租户的 Profile/模型/结果 | 在解析或读取边界拒绝；不靠返回值过滤补救 |
| T1 | 模型切换到不支持图像的模型，某工具要求图像输入 | 新 Run 的有效工具排除它并给出原因；必需能力缺失则新 Run 接纳失败 |
| T2 | 模型提出调用后权限被撤回 | invoke live recheck 拒绝，不因 snapshot 中曾有工具而继续执行 |
| T3 | attached 超阈结果被转储，再被读取/清理 | 独立 row_id，首次读取后不续期；purged 与 not_found 可区分；历史只含模型实际见过内容 |
| T4 | detached 工作完成与结果提交之间故障 | 不出现 completed 但结果永久缺失的状态；工作、执行、结果身份各自稳定 |
| E1 | 一个输入触发模型→两工具→模型最终回复 | 一个 Turn、一个 Run、两个 Step；第一 Step 三个 Action，第二 Step 一个 Action |
| E2 | Step 工具已向外发出但确认丢失，worker 崩溃 | 同 Run、新 host attempt；unknown action 不盲重试；期限不重置 |
| E3 | Session 空闲且定时器触发工作 | 新 Run 可没有 human Turn；仍有来源收据与可信租户身份 |
| E4 | Run 执行期间两个普通输入到达 | 耐久接纳独立 Turn，当前 frozen batch 不变，不并发开启第二 Run |
| E5 | 一次流式输出后用户取消 | 停止请求与停止完成可区分；已展示前缀可追踪，Run outcome=cancelled |
| E6 | 重复发送 AdmitInput/相同 slot 提交 | 相同 command_id/slot+input 返回原结果；不同 input 使用同 slot 拒绝 |

## 迁移前验证记录与后续验证

迁移前曾只检查提案文档链接和剩余模型注册索引；当时三块模型及 Schema 已撤回。
这段记录不代表当前附件清单；现有[提示词 Schema](system-prompt-profile.schema-notes.md)仍是候选材料。
以上行为场景是验收设计，**尚未由运行实现执行，也未由 TLA+/Alloy 检查**。

后续形式化分工：TLA+ 检查输入接纳、单活动 Run、epoch 与 retry、终结/取消并发；
Alloy 检查租户归属、引用闭合、Step/Action 所属关系；JSON Schema 校验结构，不能替代跨对象授权或事务证明。
无生产旧版本兼容要求；保留旧规格只为审查历史与跨语言复现，不因此构建运行兼容层。

## 当前验证范围

原 `check_agent_core_proposal.py` 已在文档体系迁移中移除。当前检查职责与覆盖边界
以[验证规范](../../../maintenance/verification.md)为准，命令从根 [Makefile](../../../../Makefile) 获取。
提案内容与验收场景保留供 review；文档或 Schema 检查通过不改变候选身份，
也不表示运行行为或形式性质已验证。历史验证结果不自动适用于当前附件和工具版本。
