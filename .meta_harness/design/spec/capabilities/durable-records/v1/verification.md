# 耐久记录 v1 验证义务

| 义务 | 所需证据 |
|---|---|
| 同流一次 append 只令 revision `+1`，多 facts 共享 revision | DR-S01 的端口、writer、恢复联合测试 |
| canonical 多流顺序、流内顺序和最终 eventId 跨在线/重启一致 | DR-S02/S04/S05 的 codec、真实 provider 与 consumer 测试 |
| writer 拒绝重复或非 canonical appends | DR-S03 负例与无位置/无 operation 副作用断言 |
| 尾部截回、完整前缀与 unknown | Recovery 模型登记任务的参数化结果，加真实 writer/故障注入；模型范围不得外推至 revision/eventId 或 owner publication |
| 二/三流资格、绑定与代际封闭 | DR-S06 与 CC-S07 的真实 Admission/Records/JSONL 联合负例 |
| 仅 system CAS 冲突仍保留原 target 与绑定、只生成另一个原操作 outcome envelope | DR-S07 的 durable outcome/fact、lookup 与重启 replay 一致性 |
| v3 codec 严格读取、旧字节拒绝可写恢复 | DR-S08 的损坏/旧格式前缀与原件保全测试，清点实际开发存量 |

证据状态及本契约实际覆盖见主题根目录的 [验证范围](../verification.md)。
