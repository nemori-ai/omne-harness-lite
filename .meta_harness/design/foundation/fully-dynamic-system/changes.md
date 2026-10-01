# 来源、确认与变化

| 可恢复输入 | 确认与迁入范围 | 对应正文定位 | 尚未确认的解释 |
|---|---|---|---|
| `docs/requirements/system/fully-dynamic-system.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`；SHA-256 `2334233d17ea3234f42c9efe2635d21bd1828d8d82273a353244e73cecf59b69`；`# SYS-DYNAMIC：完全动态系统` | 保持源文件中已确认条款、显式边界和未决项；本次仅改变知识归属与链接表达 | [requirements.md](requirements.md)：`SYS-DYNAMIC.C1`、`SYS-DYNAMIC.C2` | 正文列出的待澄清、待设计和未采用范围继续保持原状态 |
| `docs/research/fully-dynamic-system/` @ 同一提交；原始附件哈希与上游对象范围见**来源记录** | 阅读副本迁入当前路径；`history.log` 与 bundle 保持原字节，使采用快照及其 237 个可达祖先提交可独立恢复 | `SYS-DYNAMIC.C1` 的定义与时间线证据 | Git 时间不是独立可信时间戳；未验证签名身份；bundle 不含采用快照之后的历史 |

## 本轮变化

| 新基线 | 变化 | 受影响消费者 | 仍待闭合 |
|---|---|---|---|
| `omne-harness-lite-design-2026-09-15` | 等价整理为自包含 topic；源正文中的局部 `C1` / `C2` 在新基线展开为稳定坐标 `SYS-DYNAMIC.C1` / `SYS-DYNAMIC.C2`；条款内容和确认范围不变。 | 能力覆盖、精确规格、提供者和装配的后续拥有者 | 由各纵线提交条款级覆盖及引用映射，并由集成阶段核对 |

| 2026-10-01 | `SYS-DYNAMIC.C2` 末尾加一段：负责人重定 Cordis 的定位——仍是内核，是全系统集成装配时要满足的契约规范，不是建模的视角；条款原有的承诺（能力可在运行时装入、撤除与替换）不变。原话与取代范围见 [D-112](../../record/decisions/cordis-as-assembly-contract/decision.md#一裁决原话) | 手册主线、能力建模与评审判据；`SYS-KERNEL` 同日同步 | 已有契约、节点与固化投影里以内核为视角的写法，各自下次修订时处置 |

若后续发现语义差异，必须回到有权接受者；本记录不能把迁移评审升级成新需求确认。
