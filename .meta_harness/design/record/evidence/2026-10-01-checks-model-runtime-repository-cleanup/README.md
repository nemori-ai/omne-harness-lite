# 模型运行时交付：仓库准入清理与证据迁移

2026-10-01。用户选择方案 A，并要求核对 `.meta_harness/` 各目录准入、移除过程材料、去重及补忽略规则。本记录保存实际迁移及字节核对；不改变规范、产品规则或原运行结果，不构成新的模型认证。

## 实际变更与范围

- 外置 21 份成批源码、dist、发布制品及依赖快照，共 403,984,310 字节。所有原件先复制并逐 SHA-256 读回，gzip CRC 全部通过；小型原始运行日志、调查原文、评审结论和必要输入保持在各自拥有者中。
- 从本分支历史剔除 43 个路径：上述归档、5 份任务 brief／合并交接清单、6 份不属于规范的自动 TLC 轨迹、11 份起草生成器／交接稿。任务稿原件留在外置目录，不继续作为设计权威。
- 两组继承稿件的 10 个正文/补丁原件归入 `relocated/` 字节快照。冻结规范直接引用其旧地址，因此旧地址仅作相对软链接；不是可继续修改的第二份正文。原接受声明中的路径与摘要仍解释为当时输入。
- 120 份重复数据／输入快照改为指向同字节原件的相对软链接。优先复用冻结规范；其余复用原事件快照。每个旧路径读取的 SHA-256 保持。不同规范版本有独立身份，仍保留各自冻结资源；不同运行的相同短输出也不合并事件。
- 忽略规则限定生成轨迹、任务稿、具体大归档及起草生成器；没有泛化忽略 `.log`、JSON、Schema 或所有证据。

历史从 `46e615dbb8ad4aa93f592de68fcafc0eaca17fc4` 映射到 `4bf054f82f3845337404fa025dcfdea93916afe6`：共 2079 个映射，1160 个 SHA 改变。`main` `68c509293f9e232a85320fafdfe0165cfb8d3254` 及全部合并父边保持；剔除路径以外的原 blob 和模式逐项相等。认证基线 `cfc410eeeefeec1d5be999b56e221b3ab03fafa1` 对应 `6a61e63e198aebd89c42ecdf5e1ea09519a92c51`，原认证记录中的旧 SHA 不改写为新执行记录。

## 外置原件

[位置与逐文件摘要](relocations.json)给出原路径、Git blob、SHA-256、字节数及外置相对路径。主检出根下的 `tmp/model-request-runtime/evidence-archives/files/<原路径>` 是当前本机保全位置；历史版本按 [historical-versions.json](historical-versions.json) 从 `historical-blobs/<sha256>` 读取。主检出保留本地 tag `panqiwei/model-request-runtime-before-evidence-externalization-20261001` 和 `panqiwei/model-request-runtime-certified-cfc410ee`；不推这些含大文件的旧引用。

这些原件不随 Git clone 或本 PR 传输，本机目录不是远程备份。需要原件的复核者向仓库维护者按 SHA-256 取回，放回原运行布局后再执行原命令。旧 `file-hashes`、archive manifest 和接受输入摘要保持原字节，它们记录的是当时的文件布局，不能仅因外置而声称今天仍是完整本地归档。

## 去重与提交映射

[重复输入索引](duplicate-aliases.json)给出别名、唯一原件和不变摘要；[提交映射](commit-map.tsv)覆盖旧头的全部祖先，未受影响提交映射到自身；[改写核对](rewrite-verification.json)记录范围和合并关系。临时全目录准入盘点、草稿演练和派工过程保存在本次 `tmp/`，不入此记录。

## 验证边界

本迁移只调整归档位置、正文归属、同字节别名、链接和忽略规则。产品源码、词表、锁文件、构建配置、已冻结规格逐字节保持；原 T30 六门证据沿其运行范围复用，未重新发付费模型请求。迁移后的导航、登记及别名字节检查结果另追加在本节；不会用目录检查代替原真实组合或模型验证。

2026-10-01 迁移后实际检查：`make docs-check` 通过（2297 Markdown）；`make design-check` 通过（internal／formal=registered，仅登记核对，不是模型重跑）；`pnpm format:check` 通过（仓库 TS/JS 目标）；`git diff --check` 通过。原始输出见 [docs](checks/docs-check.log.gz)、[design](checks/design-check.log.gz)、[format](checks/format-check.log.gz)。[字节核对](checks/integrity-check.json)确认 1104 份冻结资源、120 个数据别名与 10 个历史地址别名逐 SHA-256 相同，43 个移除路径均由忽略规则覆盖。产品源码与构建输入另以旧头树比较，零差异。

原始 Make 日志的命令打印含尾空格，首次 `git diff --check` 因此非零；原始输出未修剪，改以小型 gzip 原字节保存后复验通过。压缩前后摘要见[检查输出摘要](checks/check-output-hashes.json)。
