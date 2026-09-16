# Coordination v1 验证范围

Admission 模型只为授权见证、效果开始前耐久和取消/安全停止后的迟到启动三个不变量提供
有限结构证据。它不覆盖 CC-01、CC-05 outbox、CC-06 crash/recover/new epoch、CC-07 observation
或 recovery interleaving；多能力真实事务、广播失败、跨域 outbox 和补偿必须由 G/L/M/E 与 I 联合验证。
契约存在不证明 provider 已实现；所有未迁消费者保持 observed-legacy 并阻断 release。
