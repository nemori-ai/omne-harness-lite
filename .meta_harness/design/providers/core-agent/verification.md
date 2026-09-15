# Core Agent 提供者符合性验证

| 契约/性质 | 当前保护点 | 实际证据 | 结论与剩余责任 |
|---|---|---|---|
| ARI-1～5 | Schema 与候选协议 | 目标 Schema 解析、P2 资源检查 | 结构可消费；唯一分配/可信来源未实现 |
| AR-4～16 | 目标 AgentHost/Registry | 仅旧 fork 源和设计映射；无目标行为测试 | provider 符合性未完成 |
| CB-01～14 | 目标共同门和窄端口 | binding 模型登记；无真实 Session/IAM 组合 | 不能声称共同屏障已实现 |
| 激活审计门 | AR 准入 + S 耐久记录端口 | 已保留 published/audit 分离和失败收口设计；无真实耐久组合测试 | 未验证审计前工作关闭、原 attempt 查询和通知顺序 |
| Cordis 装卸 | 官方 4.0.2 + 定向 fork | 锁文件与固定来源核对 | 只支持机制选择，不证明业务静止/回滚 |

实现阶段至少验证：跨租户默认拒绝、并发 activate 唯一成功、旧代际 lookup/remove 失败、准备期 revoke、ready 后审计未耐久时无工作、`published_but_audit_unavailable` 保留原尝试、通知顺序/重入 close、self-wait 拒绝、晚到资源收口、提供者繁忙撤除及 release unknown；另组合验证 scheduler 唯一交付、Run 权威 idle、广播丢失扫描与崩溃后空 Registry。
真实后端事实必须由各提供者返回；mock 只能支持端口控制流。
