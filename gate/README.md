# github-gate

本分支保存 RFC-0004 第一阶段持有发布身份密钥的流程。它不进入任何主干，只有 admin 能更新。

- `.github/workflows/gate-publish.yml`：确认后发布轨道、main 和 stable 的 PR。
- `.github/workflows/gate-reconcile.yml`：报告切换点之后没有记录的主干提交，不创建标签。
- `.github/workflows/gate-track.yml`：确认后从 main 的 first-parent 提交创建新轨道，并写 `omne/gate/track/<轨道名>` 起点标签。
- `gate/cutover.json`：各主干的切换点。切换点之前的历史见 #208。

派发方式：`gh workflow run gate-publish.yml --ref github-gate -f pr=<PR 号> -f head=<PR head 提交号>`。合入 stable 时还要传 `-f checkpoint=<名称>`。确认在 Actions 运行页面完成，必须填写说明。

新建轨道：`gh workflow run gate-track.yml --ref github-gate -f track=<轨道名，不含 integration/> -f base=<main 上的完整提交号> -f issue=<接收决定评论的 Issue 号>`。轨道仍须在 `integration-policy.json` 登记 owner 与责任。
