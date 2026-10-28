# dev-flow

[English](README.md)

开发流程工具，不发布：

- [integration](src/integration/README.md)：开工 `start`、task context、`status`、基线，以及合并目标分支后让目标基线前进的 `task-sync`。task context 的读取格式由 repo-toolchain 的 `core/task-context` 定义；本成员负责写入与完整校验。`ri-notes` 从一条轨道的 unit 记录与 PR 正文生成提升 PR 的两节，只读、只报告。集成节点另用两个命令：`worktree-cli.ts` 为已派发的 attempt 建工作树并重生成 agent 投影，`gate-cli.ts wait` 等待 gate 运行并用不超过 1024 字的说明代为确认。
- [delivery](src/delivery/README.md)：读取 Issue 与看板，报告交付卡的形状、阶段等待、依赖投影与卡属性发现。另有线归属表校验 `check:lines` 与单卡属性标签同步命令。`change-scope-cli.ts` 核对一张卡实际改动的文件在它的写范围与本线之内，`scripts/check.sh` 每次都运行它。并行推进多张卡时另有四个命令：`scope-cli.ts` 对多张卡的写范围求交，`milestone-cli.ts` 建里程碑并把卡移到另一个里程碑，`board-cli.ts` 写一张卡在看板上的日期、Line、Kind、Wave 与 Status 字段，`dispatch-cli.ts` 发派发评论并把 binding 写回卡。
- 包模板：见下文。
- [package-exports](src/package-exports/README.md)：比较成员的构建导出、机读清单和公开接口页。成员测试通过子进程调用 CLI，产品源码不依赖它。

## 包模板与采用扫描

私有 omne-package-template CLI 创建草稿并盘点精确模板采用。见[模板说明](templates/package/README_ZH.md)与[开发入口](../../docs/development.md#创建和整改产品包)。扫描复用架构读取器，结构结果不接受业务或生命周期行为。

包模板当前为 typescript-package@3.0.0，生成完整骨架；精确保留 2.0.0 与 1.0.0 旧标识规则。
`service-contract` 的创建和结构扫描不再要求 `packages/core`。
`scan --json` 在 `dependencies` 上报告已判断的边。`unknown` 保持 `unknown`。
分组方向由 dependency-cruiser 按[依赖规则](../repo-toolchain/README_ZH.md#依赖图与依赖规则)检查，不再有组的层位表；同组的 `sdk` 导入 `server-entry` 直接违反 `sdk-not-server`。
后续实施者的使用表和诊断形状见[模板说明](templates/package/README_ZH.md#后续实施者)。
`create-domain --group <名称>` 预览 package-domain@1.0.0 组文档草稿，加 `--write` 才创建。`scan --group <名称> --check` 检查组结构，与 `--member` 互斥。见[组模板](templates/domain/README.md)。Python 文档 inventory 独立检查登记、章节与占位，结构结果不能代替正文接受。
