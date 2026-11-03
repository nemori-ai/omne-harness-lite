# Schedule 工具适配的行为边界

## 责任

本成员把公开 ScheduleCommands 和 ScheduleQueries 适配为 Tool 作者、可信环境与固定结果详情。业务规则归 [Schedule](../schedule/SPEC.md)。本包不创建本地后端，不依赖 Session 或 Agent runtime，不接受模型提供的主体、owner、会话身份或原操作键。

## 固定意图与恢复

工具提供 create、execute、queryOperation、list、get、revisions、executions、agenda 和 preview 九个动作。参数与结果以 [protocol.ts](src/protocol.ts) 为唯一形状源。create 和 execute 沿用业务 schema，但原 operationKey 由可信宿主记录派生。

环境适配先读取 Tool 的耐久恢复记录，核对原 preparation、tenant、call、admission、executor 及完整参数，再通过具名恢复端口取得可信 ScheduleCallContext。写操作键固定于完整适配采用身份、tenant、call、原 admission 和业务动作，业务指纹复用 Schedule 契约算法。恢复失败不得执行写入；重启不另造操作身份。

业务结果保留 committed、noChange、rejected 和 unknown。写入结果始终携带原 locator，供调用者查询。unknown 不触发自动重发。Tool 取消或卸载不代表 Schedule 已停止，也不撤销已经发生的写入。基础环境的 preparation 和 lease 保留原责任。

## 输出与披露

参数限 64 KiB，完整结果限 4 MiB，摘要限 32 KiB。结果还限制深度、节点数和字符串长度，精确值归 protocol.ts。超限明确失败，不能通过再次执行业务来生成摘要。摘要保留身份、原操作、控制状态、依据、总数、完整性及续页信息；不能保全必要元数据时返回 output_limit。

详情只读取已产生的 invocation 和精确 result version 的 full 投影。每次读取先观察当前披露资格，核对完整结果摘要、owner、全部相关 Schedule ID 及页元信息，返回前确认观察仍有效。禁止回退 latest，禁止因本次无权限而返回旧缓存。

通用 Tool 的 read-result、read-content、read-raw、read-raw-content 也必须经过返回的 guard。宿主必须把 guard 接入真实读取链路；仅提供详情端点不能封住旁路。没有 original 的结果保留 Tool 的 no-raw-output；有原始元信息但缺少字节读取器时由通用内容协议返回 unsupported。本包不增加原始字节方法或附件协议。

续页绑定固定版本、披露观察、已读页和累计字节预算，并使用宿主注入的至少 32 字节 cursorKey 校验。相同配置重建可续读；不同密钥不能沿用旧 cursor。密钥配置和保管归宿主，不在本包建立密钥平台。

## 装配与验证

[Cordis 入口](docs/cordis.md)只注入服务和贡献注册能力。可信身份恢复、披露策略、固定结果读取及基础 guard 由宿主实现。公开协议不要求这些业务服务同机；当前适配工厂本身是本地组合端口。

持续测试覆盖公开作者、参数边界、真实 SQL 工具记录重启恢复、固定详情、通用读取 guard 和 Cordis 撤除恢复。符合性提供者验证协议消费，不等于 M2 后真实 Session、Agent 或完整 Tool 宿主已经接入。
