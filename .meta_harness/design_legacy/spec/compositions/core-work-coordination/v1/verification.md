# 核心工作协调 v1 验证义务

| 义务 | 所需证据 |
|---|---|
| committed-blocked 不能退化为 pending/not-committed 或提前效果 | CC-S01/S04 真实 writer + Admission + owner 联合测试 |
| 完整 owner baseline 原子安装并拒绝部分/旧代确认 | CC-S01/S02/S03 故障注入与并发读取测试 |
| 旧 ExactUse/资源责任在 reopen 前闭合 | CC-S06 owner 联合测试，覆盖释放失败和未知 |
| 恢复后原 operation 不重复外部效果 | CC-S04/S05 的 lookup、inspect、关联与重复请求测试 |
| 两个受信入口使用统一个人创建协议 | CC-S07/S09，联合 Tenant/Account/Admission/Records，覆盖 F 直读、互冒、同 target 的不同 T 竞争 |
| Account F 当前代受信读取与短门当前根 | CC-S08，当前代受信读取、Account 暂失、门内 I/O 探针、换代重读与 F 同 ref 异内容 |
| unknown、释放和历史/当前分层 | CC-S09/S10/S11，真实 writer 崩溃、blocked publication、CC-06 全 owner 恢复、closing/closed 后查询 |

证据状态及本契约实际覆盖见主题根目录的 [验证范围](../verification.md)。
