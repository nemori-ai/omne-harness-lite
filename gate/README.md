# github-gate

本分支保存 RFC-0004 第一阶段持有发布身份密钥的流程。它不进入任何主干，只有 admin 能更新。

- `.github/workflows/gate-publish.yml`：确认后发布轨道、main 和 stable 的 PR。
- `.github/workflows/gate-reconcile.yml`：报告切换点之后没有记录的主干提交，不创建标签。
- `gate/cutover.json`：各主干的切换点。切换点之前的历史见 #208。

派发方式：`gh workflow run gate-publish.yml --ref github-gate -f pr=<PR 号> -f head=<PR head 提交号>`。合入 stable 时还要传 `-f checkpoint=<名称>`。确认在 Actions 运行页面完成，必须填写说明。
