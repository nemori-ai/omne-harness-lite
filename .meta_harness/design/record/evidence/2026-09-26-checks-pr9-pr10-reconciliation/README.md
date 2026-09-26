# PR #9 与 draft PR #10 的协调检查

固定输入归 [inputs.json](inputs.json)，历史设计正文与规范输入为 [main 输入](main-design-input.tar.gz)与 [draft 输入](draft-design-input.tar.gz)。行政迁移依据是 [D-066](../../decisions/pr9-pr10-coordinate-reconciliation/decision.md)，唯一逐文件映射归 [registry/version-migrations.json](../../../registry/version-migrations.json)。main 归档完整保留设计树；draft 归档保留除历史交付压缩制品外的设计输入，包含全部冻结规范。原交付制品的路径、原摘要及大小见 [制品清单](draft-delivery-archives.json)，可从固定 draft 提交按原字节恢复。归档用于恢复历史字节与当时的接受事实，不能作为当前采用坐标。

## 冲突与迁移范围

原两提交的 **38 个冲突**全部在 `.meta_harness`，路径见 [原始冲突清单](original-conflicts.json)。产品源码与开发工具源码相对 draft 均未改变。

#9 的 D-038～D-045 后移到 D-058～D-065；PF-001 原 rev17 后移为当前融合 rev19，PF-016 原 rev6 后移为当前融合 rev8。draft 的历史编号保留。main 的 OG2 时刻设计迁移至 OG3；draft 的 OG2 拒绝与共同参与维持原坐标。OG3 不是 OG2 的功能超集。精确规范引用的反向闭包共有 34 份契约、146 份资源；其余 33 份 main v1 行政迁移为 v2。未来资产/据点入口仍待设计，版本未分配，不能把它的缺口指向已存在的治理 EC2/EC3。

## 实际检查

| 检查 | 结果与范围 | 原始结果 |
| --- | --- | --- |
| `make agents-check` | 通过；canonical 产物与根链接一致 | [开发工具检查](logs/repo-third.log) |
| `make docs-check design-check` | 通过；本地链接、注册与冻结、228 个词条/42 条对象/8 项待裁、48 个实现映射节点对账 | [最终设计检查](logs/final-checks.log) |
| `make test` | **175 passed**；仓库开发工具离线测试 | [测试结果](logs/repo-third.log) |
| `make product-check` | **1926 passed / 34 skipped**；格式、全部成员构建、类型检查、运行时测试、20 条结构规则扫描通过 | [产品检查](logs/product-node2421.log) |
| `verify_migration.py` | 通过；归档、冻结原字节、新坐标、精确依赖、条款编号、Schema 验证关键字及引用、形式工件可执行正文、投影输入摘要、源码差异 | [机器结果](migration-check.json) · [可重跑脚本](verify_migration.py) |
| 独立 `spec-reviewer` | 本次表达与规范范围内无阻断或新增非阻断；未执行测试或形式工具 | [评审与范围](spec-review.txt) |

环境：Linux，Python 3.12.13，pnpm 10.28.1；最终产品运行使用 **Node 24.21.0**，与原 PR 的验证版本一致。Node 官方 linux-x64 压缩包 SHA-256 为 `fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6`；下载时核对了官方 SHASUMS256。所有依赖按已有 lock 安装，未改 lock。

机器核对确认 draft 的 **173** 项冻结资源及其 catalog 条目不变；原 main 的 **182** 项冻结资源可按原登记从完整归档还原，146 项迁移目标与新冻结登记匹配；当前 catalog 有 **55** 个唯一坐标，冻结资源 **319** 项。形式模型与配置去掉注释后保持原可执行正文；Schema 的校验关键字在 URI 映射后保持不变，注释与来源标注属于行政指称。四份 main 新投影共 **1284** 项来源摘要固定到当前树。该独立探针负责迁移登记的额外断言；通用设计检查器目前不理解新 `version-migrations.json`。

从仓库根重跑静态迁移检查：

```bash
uv run --locked python .meta_harness/design/record/evidence/2026-09-26-checks-pr9-pr10-reconciliation/verify_migration.py
```

## 失败尝试与范围限制

初次产品检查在系统 Node **24.18.0** 下有三项已有 SQLite 升级测试失败（列元信息读取）；源码相对 draft 未变。换到原 PR 的 Node24.21.0 后完整产品检查通过。本次未通过修改测试断言或产品源码消除该环境差异。[初次产品失败](logs/product-check.log)完整保留。

初次文档、设计和对象对账暴露了冲突合成时的导航、版本及来源修订问题；修补后使用默认严格对账模式通过。失败记录：[文档](logs/docs-initial.log)、[设计](logs/design-initial.log)、[对象](logs/objects-initial.log)。独立评审先前报告的 OG 版本混称、未来入口占位与 PF 修订历史说明问题已修正。

本次形式检查使用 `formal=registered`，**没有运行模型工具**；原 TLA+/Alloy 的结果只在其原输入、探索范围和前提下成立。34 项跳过继续算跳过。未重做 macOS、systemd、真实终端、跨 OS 或生产部署验收；未声称 OG3 时刻、严格递增时钟、资产路由或安全重新开放缺口已经实现。本证据是合并协调与本地回归证据，远程是否无冲突须以推送后 GitHub 实际状态核实。PR 保持 Draft，本会话不执行向 main 的合并。
