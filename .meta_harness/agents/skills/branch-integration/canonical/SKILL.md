---
name: branch-integration
description: 在本项目进行工作分支同步、FI/RI、联合集成、main checkpoint、采用及未知发布恢复时，核对真实任务与 Git 事实并调用统一集成工具。
---

# 分支集成

先进入任务明确的执行仓库/worktree，核 cwd、branch、HEAD 和已有写者。读取执行仓库 `docs/engineering/integration.md`，它拥有路线、节奏、双基线及权限；实际命令和精确输入归 `tools/ts-checks/src/integration/README.md` 与相邻 SPEC。不要从 skill 安装路径推断目标仓库。

先运行该 CLI 的 status。pending 按旧任务路线继续，不因技能可见而启用。adopted 缺 anchor/context/真实授权为 unknown，不能用 main 或离线 JSON 替代。首次建设完整提交和具名采用由负责人处理；工具不提交或丢弃现有修改。

任务仍由现有 Issue 当前 revision/attempt 和正文单写者拥有。核人的责任、route、completionTarget、原 taskBase、写范围及阶段条件；Project 只是派生视图。integration 条件按实际目标生效，最终结果条件留 acceptance。

选择 work、FI、RI、joint、task-sync 或 checkpoint 后，沿统一 prepare→verify→publish 操作。agent 创建候选时提供具体 type(scope) 标题与真实 Harness/Agent-Role 来源；人的 author/committer 不变。每次 prepare 是新构造请求，中断后先找回 operation，再 verify、publish 或 resume，不重跑 prepare 冒充重试。冲突由具名集成 owner 在独立候选树处理；含义未决交相应 owner。固定 B/S/C，每卡历史审计与目标影响检查分别保留。RI 自动取完整 prefix，不手选卡或 cherry-pick 代替。已接受历史卡或旧 attempt 随后运输，逐 tuple 取得明确重核，不能改写历史绑定。

既有授权能覆盖精确动作时沿用，不重复询问。发布真实 ref 或写平台仍须任务授权及工具核验的真实决定；本 skill 本身不授写权。平台正文/Stage 写回由原单写者接续，运输不自动接受或关闭。

超时或结果未知先 resume 读实际 refs，保留 intent、候选及唯一证据。已发布的 Git 不重放；把剩余接受和投影责任交回拥有者。按共同规则判断何时 FI/RI；不新增日历调度、全量构建或模型预算。

交回固定输入、命令与真实退出、Git 观察、逐卡 declared/observed/unknown，以及实际未验证的部署前提。fixture、真实仓库检查、平台权限和宿主加载分别说明。只有清理条件和动作权限都闭合后才清理工作树或唯一 tmp。
