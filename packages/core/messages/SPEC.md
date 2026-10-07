# Message 当前采用边界

当前公开类型和 Schema 由本包拥有。F0 的消息／非消息隔离要求已按负责人明确要求采用；实现检查与交付 review 分别记录在任务 tmp。

## MS9 的限定变化

当前 Schema 身份为 `data.messages/v9`，默认公开入口仍是 `./schema`。包内只维护一份当前 Schema，不新增旧版执行入口。

相对既有 MS8，只有以下行为和形状变化：

- `AttemptStartedSource` 不再是 Message 的组成部分。`ReminderSource` 与 `SystemReminderMessage` 的来源枚举均不接受 `attempt_started`。
- 使用该来源的原 SystemReminder 在当前 `validate` 中失败，`judgeMessage` 返回 `malformed`。不会自动转换成其他 Message。
- Attempt 开始由 `session-runtime` 的具名事实 codec 拥有；作为 Session Log 的 fact 保存，不由 Message codec 或模型传输过滤器接管。
- 当前 Message 日志封装由 `session-log` 拥有，使用 `owner=messages`、`version=9`、`kind=message`。messages 不拥有 fact 分支，不能以该分支绕过 Message 校验。

其余 MS8 的形状、业务提醒、原 response、ACK、参数和无损表示承诺继续有效。尚未迁出的精确旧正文仍约束这些未改变部分；本页只取代 Attempt 来源及当前 Schema／消息封装版本。既有传递依赖所需的 v6／v3／v2 Schema 仍保持精确字节，不提供旧执行 codec。

## 验证义务

当前公共定义为 53 个。测试应精确核对从 MS8 到当前 Schema 的身份变化、一个定义删除及两处引用删除，来源数量说明同步从十一种改为十种；其余整个 Schema 结构必须相等。历史规范行中 Attempt 提醒的三个正例改为明确拒绝，其他行保持原要求。真实模型请求必须保留业务提醒并排除 Attempt 事实；单一 Schema 校验不证明当前授权、日志同提交或模型调用行为。
