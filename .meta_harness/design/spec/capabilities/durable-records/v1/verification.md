# 耐久记录 v1 验证义务

| 义务 | 所需证据 |
|---|---|
| 同流一次 append 只令 revision `+1`，多 facts 共享 revision | DR-S01 的端口、writer、恢复联合测试 |
| 通用一流、四流与逆字典序 appends 的冻结顺序、流内顺序和最终 eventId 跨在线/重启一致 | DR-S02、DR-S04、DR-S05 的 codec、真实 provider 与 consumer 测试；不把原排序实现的旧 PASS 当成新 v1 证据 |
| writer 拒绝重复 StreamRef 并原样接受唯一 StreamRef 的任意提交顺序 | DR-S03 正负例与重复时无位置/无 operation 副作用断言 |
| 普通输入与业务流 scope 双向对应、可信 namespace/主体绑定 | DR-S01、DR-S02、DR-S03、DR-S04、DR-S05 的 tenant/system 正例、混 scope/额外 namespace/错 principal 负例；真实 prepare、codec 与重启复核 |
| 尾部截回、完整前缀与 unknown | Recovery 模型登记任务的参数化结果，加真实 writer/故障注入；模型范围不得外推至 revision/eventId 或 owner publication |
| 二/三流资格、绑定、来源与代际封闭 | DR-S06 与 CC-S07 的真实 Admission/Records/JSONL 联合正负例；两来源输入 tenantId 均 null 但混流只凭当前代资格，Account 原 OperationRef.namespace 必须与已核实来源相同 |
| 仅 system CAS 冲突仍保留原 target 与绑定、只生成另一个原操作 outcome envelope | DR-S07 的 null 输入、system+tenant attemptedAppends、durable outcome/fact、完整前缀重算、lookup 与重启 replay 一致性 |
| 通用 CAS 冲突只保存 provider outcome，原业务批次全不应用，结果按原 operation 认回 | DR-S09 的 tenant/system 一流/四流、scope 双向核验、部分 mismatch、同步未知及重启 lookup；`attemptedAppends` 与原冻结条件相同，冲突前完整前缀可重算，outcome/fact 相等 |
| 新 v3 writer.acquire 的 epoch 批次确实同步并隔离旧 writer | DR-S10 的 null/system 输入、双 domain 同 epoch 不同 OperationRef、真锁、完整未回执批次、伪造记录、故障后恢复；旧格式 epoch 测试不能代替 |
| v3 codec 严格读取、旧字节拒绝可写恢复 | DR-S08 的五个互斥子类型、故意伪装的四 append conflict、OperationInput 禁填 namespace 与 scope 错配、损坏/旧格式前缀及原件保全，清点实际开发存量 |

本轮只固定候选规格与待验收性质；没有执行 TLC，也没有把旧 provider 的
`core-journal/1` 源码或历史测试视为 `core-journal/3` 实现符合性证据。
Account 来源的原账号输入摘要与本能力 `SHA-256(canonicalInput)` 的精确映射尚无
Account→CC→DR 联合接口依据；若实施要求两者逐字节相同，须先在跨能力设计中
定义不泄露凭据材料的规范输入与验证关系。此项保持候选阻塞，不由 DR 局部
重命名摘要或猜测账号输入字段来消除。

证据状态及本契约实际覆盖见主题根目录的 [验证范围](../verification.md)。
