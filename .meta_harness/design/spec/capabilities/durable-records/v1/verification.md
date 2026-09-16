# 耐久记录 v1 验证义务

| 义务 | 所需证据 |
|---|---|
| 同流一次 append revision +1，多 facts 共享 revision，eventId 按冻结事实顺序 | DR-S01/S02/S04/S05 的 codec、writer、真实重启与 consumer 联合测试 |
| 重复 StreamRef 拒绝，同 scope 任意冻结顺序保留 | DR-S02/S03 正负例，拒绝前无位置或 operation 副作用 |
| OperationInput tenantId 与业务流 scope 双向对应、可信 namespace/主体绑定 | DR-S01～S06 的 tenant/system 正例及跨 scope/错 principal 负例 |
| 个人创建 T/C 普通单租户 commit | DR-S06/S07 的单目标 tenant 流、同 UserRef 不同 T 冲突、无 A/digestA/凭据或混流字段 |
| CAS 冲突只保存 provider outcome，原业务事实不应用 | DR-S07/S09 的 attemptedAppends、完整前缀重算、unknown 与 replay |
| 尾部截回、完整前缀和 unknown | Recovery 模型的实际执行，加真实 writer 故障注入；模型不外推到 owner publication |
| writer epoch 持久化与旧 writer 隔离 | DR-S10 的双 domain、真锁、完整未回执批次和故障重启 |
| v3 严格 codec 与旧字节处理 | DR-S08 的三个封闭 envelope 子类型、非 canonical、缺/额外字段、旧格式原件保全 |

本轮尚无 DR v1 真实 provider 符合性结论。`inputDigestT` 由 Tenant C 的 canonical UTF-8 求 SHA-256，Account 私有 `digestA` 不进入 DR，也无需两个摘要的映射。实际证据状态见[版本外验证](../verification.md)。
