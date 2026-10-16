---
name: branch-integration
description: 在本项目把成果送入轨道、main 或 stable，做 FI/RI、stable checkpoint、新建轨道及未知发布恢复时，核对真实任务与 Git 事实，经 PR 和 github-gate 流程发布。
---

# 分支集成

先进入任务明确的执行仓库/worktree，核 cwd、branch、HEAD 和已有写者。读取执行仓库 `docs/engineering/integration.md`，它拥有路线、节奏、双基线及权限；实际命令和精确输入归 `tools/repo-toolchain/src/integration/README.md` 与相邻 SPEC。不要从 skill 安装路径推断目标仓库。

任务开工、路线和 task-sync 仍用该 CLI。start 核对派发评论作者是 `publish` environment 的 reviewer，不需要 bootstrap；没有派发就不运行 start，也不手造 context。没有 context 时本地检查以 `origin/main` 为基线。首次建设完整提交和具名采用由负责人处理；工具不提交或丢弃现有修改。

任务仍由现有 Issue 当前 revision/attempt 和正文单写者拥有。核人的责任、route、completionTarget、原 taskBase、写范围及阶段条件；Project 只是派生视图。integration 条件按实际目标生效，最终结果条件留 acceptance。

四条主干按 `docs/engineering/integration.md` 的“现行准入”进入，不在本机运行 prepare、verify 和 publish。

1. 推送个人工作分支，开 PR：送入轨道时 base 为 `integration/<track>`；RI 时 base 为 main、head 为轨道；FI 时 base 为轨道、head 为 main；stable 时 base 为 stable、head 为 main。PR 标题用具体的 type(scope)，提交带真实的 Harness/Agent-Role 来源。
2. 派发：`gh workflow run gate-publish.yml --ref github-gate -f pr=<PR号> -f head=<PR head 完整提交号>`，stable 另加 `-f checkpoint=<名称>`。新建轨道用 `gate-track.yml`，参数见 `github-gate` 分支的 `gate/README.md`。
3. 确认：只有 admin 能确认。说明必须写明本地运行的检查及结果、已核对的卡上条件。agent 用 admin 凭据代为确认时，说明中注明代为确认的人。没有获得该 admin 对本次动作的授权时，停在等待确认，把运行链接交回。
4. 读回：确认运行成功，目标分支等于流程报告的结果，记录标签存在，PR 上有发布决定评论。

流程停止时按报告处理：PR head 或目标在派发后变化就重新派发；合并冲突先在来源分支解决；来源轨道缺 unit 时先闭合缺口 Issue。不要用 admin 权限修改规则集绕过流程；那属于恢复，须有明确授权并在 #208 一类记录中说明。RI 携带轨道的完整前缀，不手选卡或 cherry-pick。已接受历史卡随后运输时逐 tuple 重核，不改写历史绑定。

既有授权能覆盖精确动作时沿用，不重复询问。发布真实 ref 或写平台仍须任务授权及工具核验的真实决定；本 skill 本身不授写权。平台正文/Stage 写回由原单写者接续，运输不自动接受或关闭。

运行结果未知时先读运行页面、目标分支和 `omne/gate/*` 标签。目标已等于结果并且标签存在，就按已发布处理，不重新派发；把剩余接受和投影责任交回拥有者。按共同规则判断何时 FI/RI；不新增日历调度、全量构建或模型预算。

交回固定输入、命令与真实退出、Git 观察、逐卡 declared/observed/unknown，以及实际未验证的部署前提。fixture、真实仓库检查、平台权限和宿主加载分别说明。只有清理条件和动作权限都闭合后才清理工作树或唯一 tmp。
