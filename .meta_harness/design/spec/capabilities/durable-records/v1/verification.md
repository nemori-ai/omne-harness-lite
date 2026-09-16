# 耐久记录 v1 验证说明

| 义务 | 所需证据 | 当前状态 |
|---|---|---|
| 同流一次 append 只令 revision `+1`，多 facts 共享 revision | DR-S01 的端口、writer、恢复联合测试 | 未执行 |
| canonical 多流顺序、流内顺序和最终 eventId 跨在线/重启一致 | DR-S02/S04/S05 的 codec、真实 provider 与 consumer 测试 | 未执行 |
| writer 拒绝重复或非 canonical appends | DR-S03 负例与无位置/无 operation 副作用断言 | 未执行 |
| 既有 Recovery 模型覆盖的尾部/unknown 性质 | 登记任务的 TLC 结果及精确参数 | 本轮未运行；不覆盖 revision/eventId 或 owner publication |
| 二/三流资格、绑定与代际封闭 | DR-S06 与 CC-S07 的真实 Admission/Records/JSONL 联合负例 | 未执行；旧 bootstrap 测试不覆盖注册入口 |
| 仅 system CAS 冲突仍保留原 target 和绑定 | DR-S07 的 durable outcome/fact、lookup 与重启 replay 一致性 | 未执行 |
| v3 codec 严格读取、旧字节拒绝可写恢复 | DR-S08 的损坏/旧格式前缀与原件保全测试，清点实际开发存量 | 未执行；不承诺旧格式兼容 |

本轮文字是 candidate 设计澄清。现有源码、legacy 测试和 provider 映射可提供实现线索，不能证明
实现已经符合本契约；发布采用还须固定实现 revision、装配、真实后端与上述证据。
