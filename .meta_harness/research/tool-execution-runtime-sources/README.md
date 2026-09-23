# 工具执行运行时：DSH jobs 与 minimal-runtime local-execution 能承载 PF-006 的哪几条

本项目的产品正文给「一次工具执行」定了一整套运行时语义：绑会话不绑实例、前台/后台与等待态两维、
转后台就是换宿主、中断不是失败、六种收场、停机后不重来且算失败、会话归档随之收场、发帧与等待态两个原语、
卸载是第三维（[PF-006](../../design/product/PF-006-tools-and-skills/design.md)，rev 14）。
这项调查把两份现成代码逐条对到这些条款上：DeepSeek Harness 的 jobs 三层（抽象 `dsh-jobs`、
本地实现 `dsh-jobs-local`、面向模型的工具 `dsh-tool-jobs`），以及本仓库 minimal-runtime 分支里的
`packages/tools/local-execution`。

要区分的是：**哪几条两源之一原样承载、哪几条改过才能承载、哪几条它的形状根本装不下、哪几条两源都没碰过**，
以及每一种改法要付出的代价（依赖面、与 Cordis 的耦合、内存假设、上游漂移、许可证）。
本包**不给采用建议**，只写到「这条事实让什么不可能、要付什么代价」为止。

- 调查对象与基线：
  - DeepSeek Harness commit `c291e7961a515f6d7af9304e7fd1d257929aef26`（`@deepseek-ai/dsh-root@0.1.5-rc.2`），
    取自主检出 `tmp/sources/dsh-c291e79.tar.gz`（SHA-256 `f08cfc86cb05d4186be3319670e2756375cb2788b3d2164dd7f30b885f350860`）解包的 `tmp/sources/extracted/dsh/`；
    `packages/jobs/{jobs,jobs-local,tool-jobs}`、`packages/shell/tool-bash`、`packages/interaction/tool-ask-user`、
    `docs/subsystems/jobs.md`、`docs/tool-execution-pipeline.md` 与 `.agents/notes/` 下 jobs 相关决策注记。
  - 本仓库 `.worktrees/minimal-runtime`，`feat/minimal-runtime@d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`，
    **未进 main，不是已接受的实现，只作观察对象**；`packages/tools/local-execution/` 与主检出
    `tmp/local-execution-stop-io-coordination.md`。
  - 对照的产品正文：PF-006 rev 14、PF-012 rev 7、PF-014 rev 3、PF-015 rev 10、PF-005 rev 5、PF-007 rev 16，
    统一语言 `terms/execution-and-outcome.md` 与 `domain_objects/objects.md`，均取自 HUB `.worktrees/assets-runtimes`。
- 消费者：本程 proposal「工具运行时基线」（待出现）。
- 最近核对：2026-09-23 / DSH `c291e796`、minimal-runtime `d79484d`、PF-006 rev 14（首轮）。

## 准入核对

- **来源立场**：DSH 的 README、JSDoc 与 `.agents/notes/` 是作者自述，只证明它宣称什么；
  本轮对关键宣称（内存存放、owner 生命周期、无前台转后台、`start` 的控制器栅栏、bash 的后台开关默认值）
  都回到源码行核对过。**没有找到独立第三方对 DSH jobs 的评测或批评**，短板取自 DSH 自己的
  「Known Limitations」段、注记的「Alternatives considered / Consequences」段与源码 TODO。
- **minimal-runtime 的设计依据属于已退役的旧设计链**：它的 `design.md` 以迁移 tools v1 与 legacy catalog 为施工权威，
  本轮**没有读 `design_legacy/`**，只把它的 README、design.md 与源码当作「它实际做了什么」的观察，
  不当作任何现行契约。
- **本轮没有运行任何测试**。两源的测试只按文件与用例名清点；DSH 测试数、local-execution「29/29 通过」都是来源自述。
- DSH 的抽取副本不是 git 仓库，commit 身份来自 `tmp/sources/README.md` 与 `SHA256SUMS`。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么（含 PF 条款 × 两源对照表） | [研究正文](research.md) |
| 每条观察的精确来源、行号与立场 | [证据记录](evidence.md) |
| 本轮逐行对照的完整论证原貌 | [2026-09-23 报告](reports/2026-09-23-dsh-jobs-vs-pf006.md) |

只读研究正文就知道当前该信什么；要追某一行判「需改」还是「不可承载」的推理，再展开报告。
