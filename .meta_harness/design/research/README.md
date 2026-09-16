# 研究

本家族拥有核实事实、版本化观察、推断与局限。每个持续维护的主题是一个子目录信息包，先读其 README，再按当前问题展开。

## 新建或接续主题

- 新主题从本地 [topic 模板包](.templates/topic/README.md) 开始，复制为 `<topic>/`；包内为入口和 `research.md + evidence.md`。
- 接续已有主题先读该主题入口，保留有效正文、精确来源和实际状态，只补本次缺口。
- 研究问题与来源证据分开；一次性观察可放任务 tmp/。

## 准入门槛与停止条件

- 指明会持续消费结论的具体判断、精确调查对象/版本、取得方式、实际观察和局限。
- 没有持续消费者时整项留在 `tmp/`；来源不可核实时只记录待验证命题，不能用推断填事实。

命名、裁剪与跨家族引用遵循 [信息包约定](../README.md#主题是信息包)。
模板自身不是实际主题；不要将 `.templates/` 中的候选占位符计入能力、决定或证据清单。

## 当前主题

### 系统定义与运行边界

- [完全动态系统：当前定义来源](fully-dynamic-system/README.md)
- [运行时与持久状态、恢复接续及环境适配](runtime-state-continuity-sources/README.md)
- [Connector 与外部环境信源](connector-environment-source-sources/README.md)

### 产品机制来源

- [产品账号认证与 CLI 登录的复用来源](account-auth-sources/README.md)
- [Computer、Browser、Shell 与执行环境](computer-browser-shell-environment-sources/README.md)
- [运行时能力装载与制品管理](dynamic-loading-and-artifact-sources/README.md)
- [未来规划、日历与通知](future-planning-calendar-and-notification-sources/README.md)
- [Sub-agent 要求的继承来源与范围](subagent-requirement-sources/README.md)
- [用户设置、系统 HITL 与决策池](user-governance-and-decision-pool-sources/README.md)
- [用户输入与命令](user-input-and-command-sources/README.md)

### 需求来源与缺口核对

- [产品特性的既有来源](product-feature-sources/README.md)
- [GAP 取舍与新增要求](requirements-gap-resolution-sources/README.md)
- [个人版产品要求的本质比对与 GAP 处置](personal-edition-requirement-gap-audit/README.md)

每个 topic 入口标明调查对象、版本与范围；先沿当前判断进入对应 topic，再按其阅读地图取得证据与局限。

判断方法按需读 [手册对应页](../../agents/skills/harness-design-handbook/canonical/references/design-decisions.md)。
返回 [系统设计链](../README.md)。
