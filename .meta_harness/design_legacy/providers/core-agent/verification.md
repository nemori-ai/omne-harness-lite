# Core Agent 提供者符合性验证

| 契约/性质 | 当前保护点 | 实际证据 | 结论与剩余责任 |
|---|---|---|---|
| ARI-1～5 | Schema 与候选协议 | 目标 Schema 解析、P2 资源检查 | 结构可消费；唯一分配/可信来源未实现 |
| AR-4～16 | 目标 AgentHost/Registry | 仅旧 fork 源和设计映射；无目标行为测试 | provider 符合性未完成 |
| CB-01～14 | 目标共同门和窄端口 | binding 模型登记；无真实 Session/IAM 组合 | 不能声称共同屏障已实现 |
| 激活审计门 | AR 准入 + S 耐久记录端口 | 已保留 published/audit/通知分离和失败收口设计；无真实耐久组合测试 | 未验证审计前工作关闭、审计晚到不重开、原 attempt 查询和 activated→disposed 通知顺序 |
| Cordis 装卸 | 官方 4.0.2 + 定向 fork | 锁文件与固定来源核对 | 只支持机制选择，不证明业务静止/回滚 |

实现阶段至少验证：跨租户默认拒绝、并发 activate 唯一成功、旧代际 lookup/remove 失败、准备期 revoke、ready 后审计未耐久时无工作、`published_but_audit_unavailable` 保留原尝试、审计失败/晚到/并发 close 下 activated→disposed 顺序且不扣住退出、审计完成不重开已关闭实例、通知重入 close、self-wait 拒绝、晚到资源收口、提供者繁忙撤除及 release unknown；另组合验证 scheduler 唯一交付、Run 权威 idle、广播丢失扫描与崩溃后空 Registry。
提供者特有的待验切片：同 coordinator 第二 Host 拒绝、双 Context 只见同一 Host；跨重启 AgentRef 不复用；同 Fiber 重载 ACTIVE、同名服务再注册、旧 facade/disposer 均不能恢复旧资格或撤新绑定；伪造/转交 issuer、未 pin 的 requiredUse 不能取得 ExactUse。退出故障注入须逐项观察 epoch 封闭、后代接管、真实静止与反向依赖释放，不能只断言 Map 空或 Fiber disposed。
真实后端事实必须由各提供者返回；mock 只能支持端口控制流。
