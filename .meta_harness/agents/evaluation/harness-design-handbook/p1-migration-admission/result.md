# 只读迁移准入试用结果

- 对象提交：`9ea8ae0ab584b75a89482e4fbfa131ac9719d4c1`
- 执行者：独立只读 agent `/root/p1_migration_probe`
- 行为边界：未写文件、运行测试或提交；没有读取本目录 README 中的通过条件。

## 实际读取

`canonical/SKILL.md`，`references/information-packages.md`、`workspace-context.md`、`decompose.md`，
本试用 prompt，旧 `docs/proposals/capability-basis-framework/plan.md`，`design/AGENTS.md`、`design/README.md`，
research/proposals/decisions/architecture/migrations 的 README，research/proposals 模板包，`method/README.md`、
`method/research/README.md` 及 harness-design-decisions README。未读取评估 README 或预期答案。

## 准入与拆分结论

旧 plan 整体不准入 `design/`。F0–F5、依赖与人员模型、spoke/merge/估算/命令、迁移清单、工具任务、批次、
non-goals 和待确认项属于一次施工，应留在任务 `tmp/` 或来源修订。当前材料也不建立 migrations topic，
因为没有长期前后身份/采用关系、消费者切换和可核对退出证据。

可选择性提炼且仍有消费者的部分是：需求到现有能力覆盖、剩余责任、能力演化与 Cordis 投影，三候选规则，
状态/权威分离，以及机器核对与人工评审的边界。已有严谨正文时只引用现有 handbook/governance；新增并获接受的
方法规则才进入相应拥有者，外部流程事实进入 method research 并保留精确来源。

旧文件的“能力基地图”只是待产任务。只有取得精确 requirements、decisions 和 catalog 快照后，实际当前视图
才可能从 architecture 信息包起步；真正未决的产品选择还须完成能力覆盖和至少三个实质候选，才复制 proposals 包。
当前不复制任何模板，也不新建 research/proposal/decision/architecture/migration topic。

## 停止点与冲突

- proposal 缺同一选择对象、实际覆盖/剩余责任、三个实质候选及证据；research 的旧二手摘要缺精确取得与局限。
- 文件开头声称“已确认”，后文仍有三个确认点，且缺接受者权限、精确修订和范围，不能建立 decision。
- 改变接受语义、能力定义、硬门或权威位置须交有权者；不依赖这些选择的来源核对可以继续。
- 旧文把能力限定为耐久状态/提交边界、固定七种关系，并指向单文件模板和外部 guide；这些与当前允许纯计算能力、
  非互斥演化关系、canonical 自包含渐进披露及 family 信息包冲突，不能原样吸纳。

需保留来源 Git 修订/路径/hash、实际接受记录与范围、可恢复的关联研究/方法材料及真实 docs-check 测量。
工期、作者模型、执行波次、旧 skill 名、未执行验收和事后补造候选不进入长期方法。

## 通过范围

结果满足本试用五项输出与预设通过条件：正确拒绝整份计划进入 design，选择性路由长期方法，保留状态/授权边界，
并只在准入后选择模板。它证明一个独立 agent 能用本次页面处理这一真实旧输入；不证明所有来源迁移、原生宿主加载、
任意模型行为或 handbook 的普遍正确性。
