# Session / Turn / Run / Step 提案

建议 **Turn 保留 OMNE 的输入接纳语义；Run 是逻辑执行；Step 采用 DSH 的模型—工具周期**。
这不是三者公共名词的交集，而是有意的本地命名决策，见 [社区映射](sources.md)。

```text
Session
 ├─ Turn(s) ── each refers to one admitted Message
 ├─ trigger receipt (non-chat; no artificial human Turn)
 └─ Run(s) ── frozen ordered input receipts; at most one active per Session
      ├─ ExecutionAttempt(s) ── physical host ownership, recovery epochs
      └─ Step(s) ── sequential model/tool cycles
           ├─ RequestSnapshot
           └─ LogicalAction(s) ── one model action + ordered tool actions
                └─ physical try records
```

| 模型 | 权威候选 |
|---|---|
| Session | `Session@2`（模型定义已撤回） |
| Turn | `Turn@2`（模型定义已撤回） |
| Run | `Run@2`（模型定义已撤回） |
| Step | `Step@2`（模型定义已撤回） |
| LogicalAction | `LogicalAction@1`（模型定义已撤回） |
| ExecutionAttempt | `ExecutionAttempt@1`（模型定义已撤回） |

## 为什么同时需要 Run 与 Step

一次用户请求可能多次调用模型与工具；它的逻辑 run_id 应在重启后保持不变。
Step 固定一次模型—工具周期，模型请求与每项工具仍各有独立 action slot，承载外部效果、
去重和恢复。把工具单次执行叫 Step 会丢掉 DSH 的周期边界；把每轮模型请求叫 Turn 则会
丢掉 OMNE 的输入身份。实体均由日志/受控记录表达，不要求为每个名词建独立服务或表。

Run 控制、input batch 及 canonical output 归同一会话执行控制权威；Runtime 接受物理授权。
首版不照搬原仓 legacy RuntimeSession.Run 或 thread_id。Session 的 active_run_id 与新 Run
接纳必须原子协调；未来拆服务前需要验证等价协议，不能假装单靠接口就具备分布式安全。

## 输入与动态边界

普通输入先耐久接纳为 Turn，排队等待 Run；批处理是显式策略，默认一条输入一个 Run。
正在执行时到达的普通输入不改变 frozen batch。steering 的显式模式可把补充输入安排到下一 Step，
同时记录接纳身份、目标 Run、生效 Step；不在正在发送的请求里原位注入。

新 Run 可以选择另一个合法 LLMProfile，先验证租户、模型在册、历史模态/上下文容量与工具要求；
验证失败不给出假的切换成功。模型默认整个 Run 固定仍是候选政策；Profile revision 的绑定时机
和动态模板渲染时机待业务契约决定，例如 session run start 的 hook／插件。
每 Step 请求组装可复用已渲染文本，不自动重算模板。有效工具逐 Step 解析仍是候选方案。
允许 Run 中间切模型需新增显式政策，本提案不隐式启用。

## 收束与恢复

- StepSettled：本次模型及工具批有了确定的模型可见结果（可含诚实的 detached pending 占位）。
- RunSettled：本逻辑执行已终结并提交 outcome；不意味着其所有 detached 工作已完成。
- Agent quiescent：所观察的运行时作用域没有未收束活动；不能据此归因给某条用户输入。
- Durability barrier：确认某个 offset 前事实可跨崩溃恢复；事件名叫 end 不等于已经 flush。

模型 dispatch、工具外部效果之前先记录 intent 并通过耐久屏障。若 worker 在外部操作后崩溃，
恢复读取 accepted slot/收据；known result 复用，unknown effect 暂停对账或走显式补偿，不能盲目再执行。
模型失败后的技术 retry 保持 slot/snapshot；如果改变请求内容，旧 slot 不可“同 ID 新内容”。
用户看到的流式前缀必须可在历史中解释，取消不可抹去已经对外发出的内容。

Session 的历史可以追加事件/派生消息，不强制采用 Pi JSONL 树、DSH surface node 或 LangGraph checkpoint。
分叉创建新身份；压缩保留历史证据和摘要覆盖锚。恢复不能把 runtime-local checkpoint 变成第二权威。
