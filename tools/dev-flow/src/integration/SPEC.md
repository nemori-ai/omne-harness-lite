# 分支集成工具行为契约

本工具只承担任务工作树的开工准入、状态读取、基线与 task-sync。四条主干的进入按[现行准入](../../../../docs/engineering/integration.md#现行准入)执行，由 `github-gate` 的流程发布。采用、本机发布与旧建轨道命令及其条款已按 [RFC-0009](../../../../docs/rfcs/RFC-0009-adoption-and-local-tool-retirement.md) 删除，原 I01、I02、I04、I05、I07、I09、I10、I11 随之删除。保留条款沿用原编号。

本模块兑现[多层分支规则](../../../../docs/engineering/integration.md)。公开类型及输入解析归本目录源码，命令用法归 [README](README.md)。以下承诺约束实现。

## 任务与 policy

I03。任务事实来自现有 Issue 的唯一 `omne-integration-binding:v1` JSON 区块，精确格式归 delivery/binding.ts。当前 revision 和 attempt、身份、责任、路线、taskBase 与写范围必须匹配。context 仅缓存事实。平台 Stage、关闭及交付接受不由本模块写入。

policy 固定读当前 HEAD 提交中的 `docs/engineering/integration-policy.json`。HEAD 中没有该文件时为 unknown。`parsePolicy` 只接受 `schemaVersion`、`revision`、`repository`、`deliveryConfig`、`tracks`、`transport` 与 `timeouts`，`timeouts` 只接受 `networkMs`，已删除或未知的字段拒绝。轨道条目只接受 `id`、`branch`、`owner`、`source`、`status` 与 `initialMain`；`status` 取 active、paused、retiring 或 retired。开工只接受 active 的轨道；`status` 与 task-sync 按登记读取任何状态的轨道，未登记的轨道拒绝。

## 两条基线

I06。task context 保存 `targetBase` 与每卡的 `taskBase`/`taskSource`。

- `targetBase` 是最近一次同步进来的目标提交，用于影响面与组合检查。开工时它是 `start` 读到的远端目标分支提交，之后只由 task-sync 前进。
- `taskBase` 在开工时固定，任何同步都不改变它。taskBase..taskSource 的逐提交审计保留已撤销的改动和合并父判断。

各检查边界通过 `@omne-harness/repo-toolchain` 的共同 loader 读取 context。全局 main 趋势仍用 main。`baselines` 有 context 时返回固定 `targetBase`，显式 base 与之不同时为 stale；没有 context 时返回显式 base。

context 的读格式不变：`schemaVersion` 为 1，`operation` 保留并写 `null`。新 context 不写 `anchor`；读取旧 context 时接受并忽略 `anchor` 键。

## 授权与开工

I08。生产授权读取真实 Issue comment。固定只读 `gh api GET` 核对 repository、评论所在 Issue、评论 URL、评论与采集时的正文、作者和更新时间一致，以及严格 action schema。唯一支持的 action 是 dispatch。评论作者须是 `publish` environment 的 required reviewer：个人 reviewer 按 login 与 node ID 匹配，team reviewer 按 active 成员身份匹配；environment 读不到或没有 reviewer 时为 unknown。决定的 responsible 须等于作者。决定只接受 schemaVersion、action、responsible、basis、task 与 confirmations，其他字段拒绝。本地 JSON 仅作为草稿或观察。

`start` 与 `register` 的平台读取限于任务闭包、授权卡及任务 Project 状态，范围归 [准入采集](../delivery/SPEC.md#任务准入采集)。闭包包含精确 Issue 条件目标、原生 blockedBy、原生父卡及正文父卡。独立授权卡完整读取评论以核对撤销声明，不读取其无关关系。每次最多 32 个 Issue、8 个边层级，缺页、解析错误、身份不符或超限均为 unknown。

准入核对撤销声明、精确绑定、卡未关闭、工作树分支等于 binding 的分支、taskBase 是 HEAD 的祖先，以及每个 start 条件在派发决定中有当前摘要的确认。工具只核对目标卡偏离，不以准入闭包声称全仓创建标识唯一或循环覆盖。配置 Stage 字段与任务 membership 必须确认，完整读取后的空 Stage 合法。

创建 context 前重新采集同一范围。摘要包括完整闭包内容、独立授权评论和任务 Stage。相关正文、评论、关系、Stage 或闭包变化均拒绝写入。无关 Issue 历史或其他 Project item 不进入读取及摘要。已有同绑定 context 时原样返回；已绑定另一任务时拒绝。context 只新建，不覆盖。

## 状态与同步

I12。`status` 不改 context。没有 context 时报告未绑定，不读远端。已绑定时报告绑定的卡、修订、attempt、`taskBase`、`targetBase`、远端目标分支及其当前提交，以及 `targetBase` 与远端目标的关系：相等为 current，是其祖先为 behind，其他为 diverged。远端读不到时为 unknown。

I13。task-sync 只在下列条件全部满足时把 `targetBase` 更新为 T：

- 本工作树已绑定任务，context 可读。
- 远端目标分支可读，T 是它的当前提交或祖先。
- T 是本地提交，并且是当前 HEAD 的祖先。
- 当前 `targetBase` 是 T 的祖先。
- 工作树没有未提交的改动，未跟踪文件也算改动。

任一条件不满足就拒绝，context 不变。T 等于当前 `targetBase` 时成功，不写文件。更新只替换 `targetBase`，其他键的值与顺序不变。新内容先写入同目录的临时文件，写前再比对原文件字节，未变才 rename 覆盖；原文件已变化时为 stale，临时文件删除。读者只会看到旧文件或新文件。

## 验证义务与限制

持续测试必须驱动真实隔离 Git 与 CLI，覆盖：policy、轨道与派发决定字段的正反例；不读取采用文件、锚点或标签的开工；reviewer 与 team 成员的派发、撤销和不相关平台变化；status 的未绑定、已绑定、behind、diverged 与远端读取失败；task-sync 的正常前进、T 等于 targetBase、未绑定，以及 T 未合并、T 不在远端目标历史、targetBase 后退或跳到另一条历史、工作树有改动、远端读不到等反例，每个反例都不改 context；同步后 baselines 使用新 targetBase、审计仍从 taskBase 开始。GitHub 响应模拟只能证明解析及只读协议。真实 Rulesets、Actions、权限与宿主加载不由本模块的测试证明。

Git 网络读取使用 policy 的 `timeouts.networkMs`，fetch 仅在本地缺对象时执行。超时或读取失败为 unknown。平台读取沿[Get an issue comment](https://docs.github.com/en/rest/issues/comments#get-an-issue-comment)。这些来源不代替实际运行证据。
