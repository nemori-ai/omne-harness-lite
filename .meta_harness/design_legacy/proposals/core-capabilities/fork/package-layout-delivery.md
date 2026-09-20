# 能力族与职责包布局交付

依据 [D-009](../../../decisions/D-009-package-organization.md) 和[布局方案](package-layout.md)，
已将 `475389d` 的两包源码基线重组为[14 个实际职责包](../../../../packages/README.md)。
`packages/<能力族>/<职责包>/` 从现在起是 workspace 的日常规则；族目录只导航，
每个叶子有自己的源码、依赖、导出、构建、测试范围、许可与 provenance。

`core/scope` 拥有唯一活动作用域实现，agent、Session、prompt 和 tools 直接依赖
其公开入口。Loop 归 `agent/loop`，存储接口与普通 JSONL 原语分别归
`session/persistence` 与 `storage/jsonl`。纯源消息词汇继续由 `model/llm` 唯一拥有，
媒体引用由 `media/content` 拥有；没有新建第二份 core-work 产品数据定义。
全部叶子仍为 private，公开入口统一为各 npm 名称的 `/baseline`，无旧路径转发包。

源码和测试的移动见[迁移清单](evidence/package-layout-migration.json)。94 项逐包来源
记录对应原有 80 个不同上游文件；其中同一 MIT 原件随 14 个叶子各自保存，
agent 的 runtime-types 原件分别支撑 agent 窄类型和 Loop frame 两个切片。
没有新增上游来源。文件原件字节不改动；现有算法和工具调用头固定修复保留，
归因身份改为 llm 包并从新的相对位置读取该包 manifest。原 666 项行为测试保留，
原混合 support 文件按 values/timeout 两项职责拆开。历史验证日志保持原样。

共用检查归 [package-checks](../../../../tools/package-checks/README.md)，产品包不依赖
检查工具。严格依赖检查包括 type-only import、模块声明扩展和构建声明，拒绝
未声明依赖、相对路径越包、私有子路径以及依赖环；检查器自身有对应负例。

## 验证记录

迁移后的各包构建、严格测试类型检查及 666 项行为测试已通过；检查器 4 项测试
也通过。14 个叶子各自在仓库外只安装自身及声明的传递产品 tarball，离线 strict
tsc 与 Node 公开入口消费通过。多包真实组合另外验证：

- 共同 scope 身份、父链、贡献/路由以及 owner 撤回；agent factory、依赖撤除和 initiator。
- 源 Session→assistant 流结算→存储辅助→实际文件写入/同步/追加/读回。
- prompt/tools 贡献、native 调用和撤回。
- 通过公开入口扩展 SessionEventMap、SessionProjectionStateMap/Map，执行真实 fold、
  读取有类型状态和投影快照，并验证贡献拥有者撤回。

初次组合检查暴露检查器以 CommonJS resolve 检查 ESM-only 导出的错误；移除
该不适用检查，唯一 scope 由实际跨包路由/父链/撤回行为验证。新增夹具的根 Context
误用 dispose 由严格编译拒绝，已改为释放实际插件句柄。两项问题均在开发检查代码，
没有改变产品原语行为以迎合验证。

对源码修订 `f55e3e053a501623b813b111ee10040ae27b4a32` 的完整
`make check BASELINE=475389d` 返回 0：385 份 Markdown、16 个 catalog 契约、
11 个 Schema、12 项实际形式任务、77 项 Python 工具测试、666 项源行为测试、
4 项边界检查器测试及 14 个逐包/1 个组合隔离消费者通过。
[完整集成输出](evidence/package-layout-integration-check.log)与
[命令、环境、版本及哈希](evidence/package-layout-checks.json)绑定这次范围。
[官方原件核对](evidence/package-layout-source-check.json)覆盖 14 包的 94 项记录及
当前活动目标哈希；前后 80 个不同来源的路径/哈希集合完全相等。

architecture-reviewer 已独立只读复核源码修订
`f55e3e053a501623b813b111ee10040ae27b4a32` 相对 `475389d` 的实际布局与源码：
14 包的公开依赖对齐，47 个活动源码文件都有迁移映射，scope 只有一份活动状态，
80 个不同来源的路径/哈希集合前后相等，公共声明扩展建议已兑现；范围内无阻断
问题。复核者没有运行测试或接受实现，最终检查和接受由任务作者负责。

2026-09-14，任务作者在用户要求落实实际布局的授权内，结合上述复核和实际
集成证据接受本次迁移。之后只补充本文及验证记录，并对最终文档重新检查；
产品、构建、测试与冻结规格输入没有再改变。所有修改提交在原工作分支，
主检出保持 main 且干净。

上述结果仅支持重组后的源码开发起点。D-005～D-008 的完整目标实现、租户门禁、
系统审批/HITL、耐久恢复、OpenRouter 提供者与应用闭环仍待实现；冻结规格保持不变。
