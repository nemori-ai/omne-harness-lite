# 治理实施接口的受审来源

`058c77c` 已接受为 TG-01/02/04/05、AU-01–06、BG-01–04 的实施输入，
精确范围与原 SHA-256 归[固定接受记录](delivery.md#p2-治理施工输入)。它不是
正式 v1 发布或 P2 产品通过声明。租户关闭清算、外部账务、专属同意、暂行批准
与分布式实施不在原施工范围。

当前正文从以下拥有者进入，迁移源快照为
`7e758f21f8f92c1d46fab194fdaf120239b8e11c` 的本路径。原稿不再并行维护接口。
本轮只明确既有共享值的实现声明归属，未改变其含义，具体说明在 Tenant 设计；
源 `058c77c` 不被倒写为已做过这项逐类型分配。

| 原稿范围 | 当前拥有者 |
|---|---|
| TG 状态/事件/操作、身份消费协议、共同值和治理操作消费协议 | [Tenant](../../../../packages/governance/tenant/design.md) |
| 设置/grant/声明、四值判定、PermissionScope 与事实消费 | [Authorization](../../../../packages/governance/authorization/design.md) |
| 本地预算、period/attempt、整数/币种、预留/计量/未知与费用来源 | [Budget](../../../../packages/governance/budget/design.md) |
| 实际本机身份发行、具名组合的装配投影与原行为验证 | [local-harness](../../../../apps/local-harness/design.md#治理原组合场景) |

## 保留的取舍

有限精确版本/对象集避免隐式 wildcard 与任意条件求值；MembershipBasis 的加入
修订防止移除重加恢复旧权。当前允许结合 durable 与所有尚未耐久的收紧，权限、
预算和外部事实分别由真实 owner 拥有。固定原请求先去重再分配身份，条件冲突
和拒绝也保存原结果；记录 committed 不改写业务 denied。

三项评审修订分别补齐创建请求的稳定去重、混合已知费用/剩余预留以及币种与
预算归集身份。以下保留原检查与反例历史，不将设计示例扩张为真实共同门或恢复验证。

## 接受门、缺口与证据限制

| 项目 | 本稿结论与下一门 |
|---|---|
| 已沿用事实 | TG/AU/BG/CD/CC/DR v1 与 P0 8f4cfa9；work-data 已实现。未发现必须修改冻结 v1 的直接反例；不因此声称所有候选都已证明可行 |
| 本次候选 | 三包 stream/event/result、有限精确版本/对象集合、TG joinRevision、设置目录、预算整数/周期/来源事实协议；须由独立架构评审核对并由整合者固定接受版本 |
| G1：P1 真实前提 | 当前 writer/admission 未交付；等待真实磁盘/锁/故障/双视图/ExactUse 组合接受，不把 P0 声明探针当产品提供者 |
| G2：可信身份与资源资格 | AuthenticatedInvocation、SR工作资格与真实资源 mayPerform/mayDelegate 撤销面尚待共同固定；若缺失却返回 allow，最小反例是任意管理员填资源 ID 得到工具执行。相关入口保持 unavailable，接受真实适配与两主体测试后才开放 |
| G3：HD/TL/SR 组合 | HD 决定候选/消费、TL绑定/声明发布、SR精确控制与引用清单须在各 owner 版本固定；最小反例是 DTO approve 或“index miss=无引用”绕过一批原子关系。P3 实际组合及消费者编译是开放门 |
| G3a：定义引用映射 | 本稿依 PF-006/TL-01 区分 subjectDefinition 与 Action.definition；P3 验证两个不同 Agent 定义使用同一 Plugin 时 grant 不互借、原版本集合仍精确生效。若上游消费者只持工具定义，缺失关系必须补在真实 SR/Work 依据，不能猜测 |
| G4：来源/模型 | P3 工具必须提供真实 CostSource 与 start/stop 墓碑；P4 再固定 MC profile 投影/价格/usage。用户填 0 或供应方上界未证实不能作为有限预算保证；无真实模型资格时不宣称模型覆盖已生效 |
| G5：工程观测 | D-010 @5e81ee8 的 P1 施工选择已接受，三 owner 注入受限 Diagnostics；等待其真实提供者，不复制 API。P2 原生桥/P3查询独立验收，当前未交付，本稿只固定 OB/A28 接入责任 |
| G6：产品交付 | 三个 owner 各自 RED/GREEN、公开产物/来源/无环、真实恢复与 P2/P3 联合验收；整合者核对最终源与文档后接受。测试替身或草稿不转为 accepted 产品 |

本稿只修改本文件，不改根配置/锁、packages/apps、spec/catalog/frozen 或其它
工作包正文。实际使用本 spoke 的 CPython 3.12.13 与 `uv sync --locked` 准备环境，
`make docs-check BASELINE=4253ee0` 通过 399 份 Markdown 及关联检查；
`git diff --cached --check` 核对本稿空白。日志与范围核对位于本工作树
[原件归档](evidence/governance-design/README.md)。这些只检查文档结构/链接/冻结
输入，不证明接口可编译、业务语义或 P2 产品符合性。任何必要前提出现正式规格冲突，
以精确条款、最小交错及受影响入口回传，不修改冻结文件或放宽验收。

### 对 8b75f30 独立评审的修订

本轮只处理原 reviewer 的两项语义反例及币种政策缺口，尚待原 reviewer 复核，
作者不据此自授接受。它们都可在 TG/BG/CD/DR/CC v1 内修正，不修改冻结契约。

| 评审问题 | 本稿修订与验收 |
|---|---|
| unknown 的 knownReserve 未统一参与当前及本次后余额 | E 使用所有 attempt 的 C+剩余数值预留，finite/unknown 都按 E_after 校验；部分结算不重复加原预留、不漏 unknown 数值。A26 增加 limit10 下三种 7+7 拒绝及 C3/R4、C9/R0 场景 |
| createTenant 首次去重依赖尚未知的 TG 分配 tenantId | 稳定原请求决定 tenant_creation target；分配 ID 只进记录/result。A02 增加 personal/organization 无回执重启认回及同键异输入冲突 |
| 跨币种立场缺失或预算变更可含糊重指旧账 | 来源币种参与立场及全部适用预算匹配，错绑/缺席具名拒绝；changeBudget 不改币种/归集身份；A26 增加 USD-only/EUR、明确 EUR 姿态和身份变更拒绝 |

使用本 spoke CPython 3.12.13 实际运行
归档的 `revision-probe.py`，33 项设计样例通过。
其中算术/币种样例核对明确的数值期望；创建样例在独立 Python 进程从持久 fixture
与无 tenantId 的原请求认回结果，改 kind/成员则冲突。该 fixture 仅代表已接纳
结果，不实现 core-journal/1、锁、fsync、准入并发或产品恢复；规范 JSON 仅覆盖
探针的 ASCII/整数样例，不替代 work-data。脚本、输入 fixture 和带文档/脚本哈希、
进程身份、逐项结果及局限的 `revision-probe-result.json` 均在同一 tmp 目录。
`make docs-check BASELINE=8b75f30` 通过 399 份 Markdown，日志为
`docs-check-revision.log`；`git diff --check` 通过。产品 TDD、P1/P2/P3 真实组合
和独立复核仍按上表的接受门执行。
