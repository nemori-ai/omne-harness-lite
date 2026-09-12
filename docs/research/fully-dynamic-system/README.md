---
kind: research
id: R-fully-dynamic-system-origin
scope: omne-next 完全动态系统定义的原文、原始 Git 历史与时间线
---

# 完全动态系统：原文与历史来源

[系统目标](../../requirements/README.md) · [研究索引](../README.md)

2026-09-12，按用户要求从本机 `omne-next` 检出复制定义文档，并保存可独立恢复的
原始 Git 历史。现有历史中，原稿首次出现于 **2025-09-17 19:55:34 +08:00**，
提交为 `111d3220e8f41a4640d0b1345e6884d0f23d84a9`。这是该仓库保存的提交时间，
不推断为思想首次形成或首次公开发表的时间。

## 原文入口

| 本地原件 | omne-next 原路径 | 用途 |
|---|---|---|
| [中文定义](fully-dynamic-system.zh.md) | `docs/fully-dynamic-system.zh.md` | 系统目标引用的定义正文 |
| [英文版本](fully-dynamic-system.md) | `docs/fully-dynamic-system.md` | 同期英文文档 |
| [早期原稿](fully_dynamic_system_intro.md) | `docs.deprecated/fully_dynamic_system_intro.md` | 保留首次提交以来的原稿与原有表述 |

三份文件均按 Git blob 原字节复制，没有调整正文、排版或 front matter。原稿与
首次提交时根目录的 `fully_dynamic_system_intro.md` 字节一致；两次目录迁移均为
Git 记录中的 `R100`，没有内容修改。

这些文件是来源快照。后续澄清在目标、设计或所属规格中维护并引用原文；不原地
改写来源快照，也不将英文版另立为一套独立语义。

## 来源版本与历史范围

- 来源仓库：`https://github.com/nemori-ai/omne-next`，地址取自本机 Git remote。
- 核对时的本机 `main`：`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，非浅克隆，工作区干净。
- 采用快照：`5d6322d85652f17b72cf97043b6300926c41083a`，也是这组文档最后发生修改的提交。
- 已确认采用快照中的三份 blob 与核对时 `main` 中的对应文件一致。
- [Git bundle](omne-next-history.bundle) 保存截至采用快照的完整祖先历史，共 237 个原始提交，大小 8,934,083 字节。

bundle 内的分支为 `refs/heads/omne-next-definition-history`。为保留原始提交哈希、
父链、树对象和已有签名，包中也包含这些祖先提交中的其他源文件；没有重写或按
路径过滤提交，没有纳入采用快照之后的仓库历史。历史随 bundle 保存，恢复时可在
独立仓库中执行原生 Git 命令。

## 文档时间线

以下四个提交的作者时间与提交者时间分别核对后均相同；表中保留原始 `+08:00`
时区，完整作者、提交者、父提交和签名字段见 [history.log](history.log) 与 bundle。

| 作者时间 / 提交者时间 | 原始提交 | 变化 |
|---|---|---|
| 2025-09-17 19:55:34 +08:00 | `111d3220e8f41a4640d0b1345e6884d0f23d84a9` | 根目录首次加入 `fully_dynamic_system_intro.md` |
| 2025-09-22 13:27:56 +08:00 | `72b9e2a933e5e7f3b22fa88e48a588d176ced97b` | 原稿移至 `docs/fully_dynamic_system_intro.md`，内容不变 |
| 2025-12-08 19:46:28 +08:00 | `f4a519b1548de7ee82815fa5b73f168d9aec539d` | 原稿移至 `docs.deprecated/`，内容不变；新增现有中英文文档 |
| 2025-12-09 16:38:23 +08:00 | `5d6322d85652f17b72cf97043b6300926c41083a` | 中英文文档移除章节间分隔线 |

Git 对象保留原始作者和提交者时间，但这些字段可由提交者设置。本次保留了首次
提交中已有的 PGP 签名，未执行签名身份验证或独立可信时间戳核验；不能仅凭 Git
时间宣称已获得独立的历史时间证明。

## 内容采用与待澄清项

用户已指定该文档作为“完全动态系统”的定义来源，[系统目标](../../requirements/README.md)
据此引用。原文中的工作定义、公式、MVC-4 与两项扩展标准均完整保留。

原文有一处判定表述需要在精确建模前澄清：定义后的“要害在于”段落称策略参数、
动作空间、组织拓扑中**任一维度**可自发演化即可称完全动态；后文则要求满足
**全部 MVC-4**。本次保留两处原话，不代替用户选择其量词含义。

原文关于外部框架能力的比较及文献引语的归属，本次未重新核验；它们保留为来源
当时的论述，不作为外部框架当前版本的事实结论。复制定义不自动批准其中所有
实现建议，也不代替本项目的版本化精确契约。

## 复核与恢复

[provenance.json](provenance.json) 记录源路径、快照、各文件 blob ID、SHA-256、
文档提交信息与 bundle 范围；[SHA256SUMS](SHA256SUMS) 覆盖原件、日志、来源记录
和 bundle。本次已在不依赖来源对象库的空 bare 仓库中恢复，完成 bundle 校验、
`git fsck --full`、全部 237 个原始 commit 对象逐字节比较，以及三份文档的内容
和 blob ID 比较。

从本目录检查附件哈希：

```sh
sha256sum --check SHA256SUMS
```

从本项目仓库根恢复到一个尚不存在的临时目录：

```sh
git bundle verify docs/research/fully-dynamic-system/omne-next-history.bundle
git clone --bare --branch omne-next-definition-history docs/research/fully-dynamic-system/omne-next-history.bundle tmp/omne-next-dynamic-history.git
git -C tmp/omne-next-dynamic-history.git fsck --full
git -C tmp/omne-next-dynamic-history.git log --follow --format=fuller --date=iso-strict -- docs.deprecated/fully_dynamic_system_intro.md
git -C tmp/omne-next-dynamic-history.git log --follow --format=fuller --date=iso-strict -- docs/fully-dynamic-system.zh.md
git -C tmp/omne-next-dynamic-history.git show 111d3220e8f41a4640d0b1345e6884d0f23d84a9:fully_dynamic_system_intro.md
```

复现不依赖原仓库仍存在，也不需要访问网络。SHA-256 用于核对保存内容的一致性，
时间与签名的证据范围仍以上文说明为准。
