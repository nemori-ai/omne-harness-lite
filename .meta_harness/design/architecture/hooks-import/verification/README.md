# 验证义务

本页约束未来真实提供者的验证，不表示已经执行或通过。采用行为见[设计](../design.md)，规范输入见[场景](scenarios.md)。

| 领域 | 必须覆盖的场景 | 输入与受阻边界 |
|---|---|---|
| hooks | 每handler恰一次含不导入；坏matcher整份拒；allow非放行；已启动普通错误与不可用/失联两类且日志；ask无授权/proposedRewrite/回放不重跑；同pathname、handler插入代价；Stopactive从日志跨重启 | 当前工作区义务是本workspace原位optin、来源off优先、不授execute、native/兼容冲突/去重/下次装配。examples1～4的report、PreToolUse退出、其他事件映射须保持全部差异；执行环境端口仍保持进程/日志责任 |

授权、来源、并发提交与外部作用使用真实组合；unknown不补成功。范围及前提不能用Schema、Mock或局部模型替代。单次执行结果留工作树tmp。
