# 使用分支集成工具

本工具为任务工作树开工、读取状态与基线，并在同步目标分支后更新目标基线。四条主干的进入按[现行准入](../../../../docs/engineering/integration.md#现行准入)执行，由 `github-gate` 的流程发布。本工具不构造候选，也不验证、发布或写平台。

从仓库根运行。行为承诺归 [SPEC](SPEC.md)，工程节奏归[多层分支规则](../../../../docs/engineering/integration.md)。policy 固定读当前 HEAD 提交中的 `docs/engineering/integration-policy.json`，交付配置按 policy 的 `deliveryConfig` 读取。命令存在不授予项目 ref 或平台写权限。

## 先观察

```sh
node --experimental-strip-types tools/dev-flow/src/integration/cli.ts status
node --experimental-strip-types tools/dev-flow/src/integration/cli.ts baselines [--base REF]
```

`--root PATH` 指定实际被操作的 Git 工作树，缺省为当前目录。

`status` 报告本工作树的 task context 与远端目标分支：

- 没有 context 时输出 `{"bound": false, "root": ..., "branch": ..., "head": ...}`，不读远端。
- 已绑定时另输出 `issue`、`revision`、`attempt`、`taskBase`、`targetBase`、`target`（远端目标分支的 `ref` 与当前提交 `head`）和 `relation`。`relation` 为 `current`（`targetBase` 等于远端目标）、`behind`（`targetBase` 是远端目标的祖先）或 `diverged`（`targetBase` 不在远端目标的历史上）。
- 已绑定而远端目标读不到时失败，错误码为 `unknown`。

目标分支由 binding 的 route 决定：track 路线是 registry 登记的 `integration/<轨道>`，global 与 cross-track 路线是 `main`。远端位置取 policy 的 `transport.location`。

`baselines` 输出检查用的基线。有 context 时输出固定的 `targetBase` 与本任务的审计范围；`--base` 给出的提交与 `targetBase` 不同时拒绝，错误码为 `stale`。没有 context 时 `targetBase` 是 `--base` 的值，`scripts/check.sh` 在它为空时退回 `origin/main`。输出中的 `state` 来自 `@omne-harness/repo-toolchain` 的读格式：没有 context 时为 `pending`；有 context 时 0.0.4 输出 `adopted`，0.0.5 起输出 `bound`。消费钉住版本的成员只判断它是否为 `pending`，所以两个版本下的结果相同。

## 执行命令

变更命令统一读取严格 JSON 文件：

```sh
node --experimental-strip-types tools/dev-flow/src/integration/cli.ts execute \
  --root "$WORKTREE" --input "$COMMAND_FILE"
```

`COMMAND_FILE` 只含命令参数，不能代替授权。`kind` 只接受 `register`、`start` 与 `task-sync`；多余字段或已删除的命令拒绝。成功时向标准输出写 JSON。任何失败都向标准错误写 `{"code": ..., "message": ...}` 并退出 2。`code` 为 `refused`、`unknown`、`stale` 或 `input-error`，都不表示成功。

## 任务与执行权

Issue 正文的 `当前执行与交接` 中放唯一 `json omne-integration-binding:v1` 围栏区块。形状归 [TaskBinding](../delivery/binding.ts)：schemaVersion=1；issue 包含 repository/id/number/url；revision 等于正文交付修订；attempt、responsible、branch、route、completionTarget、taskBase、writeScope、dispatch、conditions、authorization 都必填。route 为 `{kind:"track",track:ID}`、`{kind:"global",owners:[受影响拥有者]}` 或 `{kind:"cross-track",owners:[受影响拥有者]}`。completionTarget 为 track/main/stable。conditions 只引用同卡条件 ID。

taskBase 是开工固定 SHA，同步目标分支不改变它。work branch 必须以 responsible 加 `/` 开头。dispatch 是下述 dispatch 决定的真实评论 URL。用现有单调度者发放权限、原正文单写者维护绑定；worker 不争写摘要。

在具名工作分支执行：

```json
{
  "kind": "start",
  "authority": "真实评论URL",
  "issue": "真实IssueURL",
  "revision": 1,
  "attempt": "实际attempt"
}
```

`register` 与 `start` 同一准入。两者只读取目标任务闭包、授权卡完整评论和目标任务 Project 状态，不枚举仓库历史或全 Project items。闭包最多 32 个 Issue、8 个边层级，独立授权卡计入总数。必需页、条件解析或配置字段不完整时拒绝。Stage 已确认且完整读取后未设值时，`null` 合法。

准入核对卡的 revision、attempt、分支、taskBase 是 HEAD 的祖先、写范围与开工条件，拒绝已关闭的卡。track 路线的轨道必须在 registry 中为 active。创建 context 前双读相关输入，变化则拒绝写入。新 context 的 `targetBase` 是开工时读到的远端目标分支提交，`operation` 为 `null`，不写 `anchor`。

执行失败不创建部分 context。已有同绑定 context 时照原样返回；另一绑定须明确新树。离线 delivery capture 可作观察，不作派发资格。

## 同步目标分支

任务执行期间同步目标分支分两步：

1. 在工作分支上用普通的 `git merge` 合并远端目标分支的提交 T，解决冲突并提交。
2. 运行 task-sync，`target` 为 T 的 40 位提交号：

```json
{ "kind": "task-sync", "target": "T 的完整提交号" }
```

命令在下列条件全部满足时，把 context 的 `targetBase` 原子更新为 T，其他字段不变：

- 本工作树已绑定任务，context 可读。
- 远端目标分支可读，T 是它的当前提交或祖先。
- T 是本地提交，并且是当前 HEAD 的祖先。
- 当前 `targetBase` 是 T 的祖先。`targetBase` 只能前进。
- 工作树没有未提交的改动，未跟踪文件也算改动。

任一条件不满足就拒绝，context 不变。T 等于当前 `targetBase` 时命令成功，不改文件。命令输出更新后的 context。

## 条件

交付条件表允许第七列 `适用目标`，六列表默认 all。integration 支持 all/track/main/stable 或完整 `refs/heads/main`、`refs/heads/stable`、`refs/heads/integration/ID`。指向未登记轨道的条件拒绝。进入 main 前的条件只阻 main；work→track 可先完成。start/acceptance 保持 all，最终“main 包含本结果”写 acceptance，避免运输自锁。

派发决定的 confirmations 绑定每个 start 条件的当前摘要 `conditionDigest(condition)`。没有这些真实确认就不能开工。

## 真实授权评论

URL 为 policy `repository` 中的 Issue comment。工具固定只读 `gh api GET`，核对评论所在 Issue、评论 URL 与采集时内容一致。评论作者须是 `publish` environment 的 required reviewer：个人 reviewer 按 login 与 node ID 匹配，team reviewer 按 active 成员身份匹配。author_association 不授予权。

评论中放一个 `json omne-integration-authority:v1` 区块，只支持 `dispatch` 一种 action。字段为 schemaVersion=1、action、responsible（须等于评论作者）、basis（非空依据数组）、task（完整 binding）和 confirmations（每项 issue/condition/digest/evidence）。精确运行时 schema 归 [authority.ts](authority.ts)，其他字段拒绝。

撤销评论用 `json omne-integration-revocation:v1`，字段为 schemaVersion、`decisions`（被撤销决定 URL 的数组）与 basis。出现适用撤销则拒绝，需新的派发决定。完整撤销治理仍由交付协议拥有。

## 持续验证

在 `tools/dev-flow` 下运行：

```sh
pnpm exec vitest run tests/integration-*.spec.ts
pnpm run typecheck
```

测试文件为 `integration-boundaries`、`integration-context`、`integration-engine`、`integration-sync` 与 `integration-transport` 五个 `.spec.ts`。它们用临时真实 Git（含 bare 远端）和受限只读 GitHub 响应。真实仓库检查、fixture 检查、平台部署及宿主加载分别报告，不能互相代替。

网络读取使用 policy 的 `timeouts.networkMs`，`timeouts` 不接受其他字段。fetch 仅在本地缺对象时执行。远端读取失败或超时为 `unknown`。
