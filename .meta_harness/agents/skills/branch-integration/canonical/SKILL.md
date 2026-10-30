---
name: branch-integration
description: 在本项目把成果送入轨道、main 或 stable，做 FI/RI、任务同步、stable checkpoint、新建轨道或子轨道、经 gate-release 做 npm 发行（发布 repo-toolchain 等工具包）及未知发布恢复时，核对真实任务与 Git 事实，经 PR 和 github-gate 流程发布。
---

# 分支集成

先进入任务明确的执行仓库/worktree，核 cwd、branch、HEAD 和已有写者。读取执行仓库 `docs/engineering/integration.md`，它拥有路线、节奏、双基线及权限；实际命令和精确输入归 `tools/dev-flow/src/integration/README.md` 与相邻 SPEC。不要从 skill 安装路径推断目标仓库。作为一波的集成节点合入多条线的候选时，按 integrate 技能逐步执行。

任务开工和状态读取用该 CLI 的 start 与 status。start 核对派发评论作者是 `publish` environment 的 reviewer；没有派发就不运行 start，也不手造 context。没有 context 时本地检查以 `origin/main` 为基线。工具不提交或丢弃现有修改。

任务执行期间同步目标分支分两步。先在工作分支上用普通的 `git merge` 合并远端目标分支的提交 T，解决冲突并提交。再运行 task-sync，输入 `{"kind":"task-sync","target":"<T 的 40 位提交号>"}`，让 context 的 targetBase 前进到 T。运行前工作树须干净，未跟踪文件也算改动。taskBase 不变。命令拒绝时 context 不变；按错误信息处理，不手改 context。

任务仍由现有 Issue 当前 revision/attempt 和正文单写者拥有。核人的责任、route、completionTarget、原 taskBase、写范围及阶段条件；Project 只是派生视图。integration 条件按实际目标生效，最终结果条件留 acceptance。

四条主干按 `docs/engineering/integration.md` 的“现行准入”进入，只经 PR 与 `github-gate` 流程发布。本机的候选、验证、发布与采用命令已删除。

1. 推送个人工作分支，开 PR：送入轨道时 base 为 `integration/<track>`；RI 时 base 为轨道的上游、head 为轨道；FI 时 base 为轨道、head 为它的上游；stable 时 base 为 stable、head 为 main。顶层轨道的上游是 main。轨道的上游按 integration.md「轨道树与上游」判定；跨层或兄弟轨道之间的 PR 会被拒绝。RI 的 PR 说明按 `gate/README.md` 列出所含的卡。PR 标题和正文只按 `CONTRIBUTING.md` 写，标题用具体的 type(scope)，提交带真实的 Harness/Agent-Role 来源。PR 标题和正文不加 `Generated with <agent>` 一类的工具署名页脚，宿主自动附加的也删掉。每次上下文压缩之后，重新对照 `CONTRIBUTING.md` 核对这些格式。
2. 派发：`gh workflow run gate-publish.yml --ref github-gate -f pr=<PR号> -f head=<PR head 完整提交号>`，stable 另加 `-f checkpoint=<名称>`。新建轨道用 `gate-track.yml`，传入 `parent`，参数见 `github-gate` 分支的 `gate/README.md`。npm 发行用 `gate-release.yml`，规则见 integration.md「现行准入」的 npm 发行一条，参数同样见 `gate/README.md`。
3. 确认：只有 admin 能确认。说明必须写明本地运行的检查及结果、已核对的卡上条件。agent 用 admin 凭据代为确认时，说明中注明代为确认的人。没有获得该 admin 对本次动作的授权时，停在等待确认，把运行链接交回。获得授权后，用下面的命令确认并等待运行结束，后台运行，等完成通知。参数、退出码与说明的长度上限见 `tools/dev-flow/src/integration/README.md`「等待 gate 并代为确认」。不手工轮询 `pending_deployments`。

   ```sh
   node --experimental-strip-types tools/dev-flow/src/integration/gate-cli.ts wait --run <运行号> --note <说明文件> --environments <环境列表>
   ```

   环境列表默认只写 `publish`。改动命中 `github-gate` 上 `gate/toolchain-paths.txt` 的工具链路径时，写 `repo-toolchain-review,publish`。
4. 读回：确认运行成功，目标分支等于流程报告的结果，记录标签存在，PR 上有发布决定评论。npm 发行没有 PR 和目标分支：读回 registry 上的版本与完整性，以及 Issue 上的发布决定评论。

流程停止时按报告处理：PR head 或目标在派发后变化就重新派发；合并冲突先在来源分支解决；来源轨道缺 unit 时先闭合缺口 Issue。不要用 admin 权限修改规则集绕过流程。流程失效时的恢复由 admin 按 `docs/engineering/integration.md` 的“权限、候选与恢复”执行：先在 Issue 中写明原因，事后在缺口 Issue 中写具名决定。没有该 admin 对本次恢复的明确授权时，停下报告。RI 携带轨道的完整前缀，不手选卡或 cherry-pick。main 的变化逐层同步，先进顶层轨道，再进下一层。已接受历史卡随后运输时逐 tuple 重核，不改写历史绑定。

既有授权能覆盖精确动作时沿用，不重复询问。发布真实 ref 或写平台仍须任务授权及工具核验的真实决定；本 skill 本身不授写权。平台正文/Stage 写回由原单写者接续，运输不自动接受或关闭。

运行结果未知时先读运行页面、目标分支和 `omne/gate/*` 标签。目标已等于结果并且标签存在，就按已发布处理，不重新派发；把剩余接受和投影责任交回拥有者。按共同规则判断何时 FI/RI；不新增日历调度、全量构建或模型预算。

交回固定输入、命令与真实退出、Git 观察、逐卡 declared/observed/unknown，以及实际未验证的部署前提。fixture、真实仓库检查、平台权限和宿主加载分别说明。只有清理条件和动作权限都闭合后才清理工作树或唯一 tmp。
