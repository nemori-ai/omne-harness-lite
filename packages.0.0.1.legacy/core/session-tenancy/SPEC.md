# session-tenancy 行为契约

采用依据：2026-10-04 用户授权采用经审阅的 Tool Runtime r10 设计并实施第二阶段。公开形状归 `src/index.ts`；本页只约束类型不能保证的行为。分阶段兑现范围由实际验证证据报告，不以本页存在宣称全部实现。

AC-1（core/session-tenancy）活体绑定必须由可信入口签发。每次使用核验当前身份、会话持有和操作许可；brand 或引用不是授权。旧绑定不可序列化复活。issue 不暴露为普通插件服务。

AC-2（core/session-tenancy）principalKind 独立于 context consumer。签发器从真实入口验证 human/system/agent 身份种类与 principal 后写入绑定；answer 的 by 原样来自 authorize 的这两项，答复 JSON 不能选择来源种类。无法核实来源即不签发或 unavailable，不能默认为 human/system。

AC-3（core/session-tenancy；core/session-log 消费）SessionAccess 用于 readPrefix/borrow 时必须通过 session.log.coordinate 校验；签发器只给已核实的应用协调组件此权，不因 tool.submit/tool.read 或自报 consumer 而授予。普通工具绑定不能借任意日志面。RecoveryAccess 沿 EE-10 验证维护 owner 和既有责任，不能据借用扩大为新执行权。

## 创建时持有租户

每个已创建 Session 恰持有创建时捕获的一个 TenantId；切当前租户、睡醒或正常重启不改。日志壳、执行、凭据和账的租户判定取该 holding，不来自 caller、进程或当前选择。读取能力不承担产品创建时那次写入。

表示先拒 invalidInput。unknown 是本映射没有记录，可能 Session 已存在而映射未建立，不能细分为“无租户”后放行。事实不可读为 unavailable，不混 unknown／默认值；参数无默认，失败时 caller 也不能补自己或其他 Session 的租户。unknown 可转 known；一旦 known，后续只同 TenantId 或 unavailable，不转另租户／NotFound。

持久映射没有 update／delete 时可以缓存已知 holding 值，这不许可缓存活体授权。CurrentSessionAccess 每次使用仍核最新身份／资格。该 reader 只供可信内部消费者；拿到 SessionRef 不获得公开终端任意查询或授权能力。

换 provider 保持持久事实，withdrawal 不删映射，真实停止与排空沿提供者的 close 责任。跨进程还须认证 caller、回复绑定具体 SessionRef 及一致复制，不满足为 unavailable；落后副本不能假 unknown。当前单 SQLite 不声称已兑现分布式读。

stored Tenant 畸形、升级未合缺表都是 StorageDefect，不混 unavailable／unknown。same Session 不同 Tenant 的唯一拒绝保持旧事实；同值 seed 的 created／alreadyPresent 按提供者现行协议。参与 unit 的错误实例、已关闭、并发误用及 unavailable 须污染外层事务，即使 caller catch 也不许部分提交；reader 返回不结束外层 unit。

restricted seed 是 bootstrap／测试机制，不是新 Session 创建产品。catalog 不得跳坏行或交残缺集。升级确认须在真实必需 fiber ACTIVE 后成功才 seed／开闸，失败零准入。映射不变只在存储耐久／恢复前提成立时保证，不涵盖恢复旧快照或硬件耐久未成立情形。
