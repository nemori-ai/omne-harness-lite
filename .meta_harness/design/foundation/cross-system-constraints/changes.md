# 来源、确认与变化

| 可恢复输入 | 确认与迁入范围 | 对应正文定位 | 尚未确认的解释 |
|---|---|---|---|
| `docs/requirements/system/constraints.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`；SHA-256 `6e959ebecc755643f3a1988573a5135cf973bd06cf2aff765396965008650991`；`# 已确认的跨系统约束` | 保持源文件中已确认条款、显式边界和未决项；本次仅改变知识归属与链接表达 | [requirements.md](requirements.md)：`SYS-IDENTITY`、`SYS-KERNEL`、`SYS-SPEC`、`SYS-DEPLOY`、`SYS-TENANT`、`SYS-LLM`、`SYS-EXPERIMENT` | 正文列出的待澄清、待设计和未采用范围继续保持原状态 |

## 本轮变化

| 新基线 | 变化 | 受影响消费者 | 仍待闭合 |
|---|---|---|---|
| `omne-harness-lite-design-2026-09-15` | 等价整理为自包含 topic；身份和条款不变，没有接受新政策 | 能力覆盖、精确规格、提供者和装配的后续拥有者 | 由各纵线提交条款级覆盖及引用映射，并由集成阶段核对 |

| `omne-harness-lite-design-2026-09-15` | **2026-09-25 新增 `SYS-OPEN`**（产品负责人原话见 `tmp/assets-runtimes/pending-user-rulings.md` §二′ 与本 topic 正文）：核心能力是可公开的独立函数闭包，runtime 只是一种消费者，按开源框架角度提供最大自定义灵活度 | 本程全部 provider 节点（须区分公开函数面与服务面）、实施边界稿、后续所有节点模板 | 各节点补「公开面」一节；节点模板加该栏 |

若后续发现语义差异，必须回到有权接受者；本记录不能把迁移评审升级成新需求确认。
