# 旧需求基线的对象保全

2026-09-20 从承载仓库根 `docs/research/requirements-baselines/` 原样搬来。
同一批搬迁里其余六份进了 [agents/research](../../../agents/research/README.md)，
**这一份没有**——它不是「别人怎么做」的调查，是**一次恢复验证留下的对象与结果**。

放在 `design_legacy/requirements/` 下，因为它保全的正是**旧体系**那批需求正文。
留档区不参与活设计链的检查，**原件的链接因此可以保持原样**。

## 保全的是哪一个

| | |
|---|---|
| 提交 | `8688fe36a9d3d23edabd2f8c7a436b73cc15f34c`（2026-09-12） |
| 保留引用 | `refs/tags/requirements-baseline/2026-09-12-foundation` |
| 自包含历史包 | [`2026-09-12-foundation.bundle`](2026-09-12-foundation.bundle)，9,394,982 字节 |
| 逐文件哈希 | [`2026-09-12-foundation.json`](2026-09-12-foundation.json)，13 份需求文件当时的 SHA-256 |

当时用全新空仓库做过完整恢复验证：清 reflog、`gc --prune=now` 之后仍取回该提交，
逐字节核对 13 份文件并通过 `git fsck --full`。过程见[原件 README](README.md)。

## 今天还要紧的理由

新体系 [`design/foundation/`](../../../design/foundation/README.md) 七份 `requirements.md` 的
front matter 都带 `source_baseline: omne-harness-lite-legacy-spec` 与 `source_file: docs/requirements/…`。
**那套溯源指向的就是根 `docs/requirements/`，而它已于 2026-09-20 清退。**
如今能把 `source_sha256` 核回原文的只剩 Git 对象——**这份 bundle 不依赖任何分支或远端**。

## 它不保全什么

**本仓库现有七个 `requirements-baseline/*` tag，这份 bundle 只保全了其中一个。**
其余六个（`2026-09-13-agent-runtime`、`2026-09-13-core-approval-supplement`、
`2026-09-13-core-capabilities`、`2026-09-13-dsh-core-adoption`、`2026-09-14-agent-loop-inbound`、
`2026-09-15-tool-execution-message-stream-hooks`）**只有 tag，没有自包含包**。

### 一处现在就不成立的地方

新体系那七份 front matter 实际引用的是 **`e3573ca72d18bfe7ddd002df5025551b51eede46`**
（2026-09-15，`chore(meta-harness): establish migration framework baseline`），
**不是**本 bundle 保全的 `8688fe36`。而 `e3573ca`：

- **没有任何 tag 指着它**；
- **不能从任何 `requirements-baseline/*` tag 到达**；
- 目前**只活在 `feat/meta-harness` 这一条开发分支上**。

[旧需求维护规范](../../governance/requirements.md#基线保留)对此写得很明确——
保留引用「不得改指或删除，也不能依赖可清理开发分支或本机 reflog；squash、rebase 或 GC
不得使已接受决定引用的基线丢失」。**现在正踩在这条上。**

这不是搬迁造成的，搬迁只是让它露出来：那份规范随旧体系一起进了留档区，
而新体系没有承接它的正文，也就没人在执行它。**闭合它需要一个决定，不是补一次提交。**

## 原件未改，路径变了

[`README.md`](README.md) 保持搬来时的原样，其中指向 `../../maintenance/requirements.md`、
`../../requirements/README.md` 的相对链接是按它原来在 `docs/research/` 下的位置写的，
**在这里不成立**——对应正文现在分别在
[`design_legacy/governance/`](../../governance/) 与
[`design/foundation/`](../../../design/foundation/README.md)。

恢复命令里的 bundle 路径同样是旧的；从仓库根执行时用：

```sh
git -C <新测试仓库> fetch \
  "$PWD/.meta_harness/design_legacy/requirements/baseline-preservation/2026-09-12-foundation.bundle" \
  refs/tags/requirements-baseline/2026-09-12-foundation:refs/tags/requirements-baseline/2026-09-12-foundation
```

其余步骤与核对方式照原件。

## 它不是什么

- **不是当前需求正文。**当前目标在 [foundation](../../../design/foundation/README.md) 与
  [product](../../../design/product/README.md) 演进。
- **不是第二份需求注册表。**身份与版本清单归 [registry](../../../design/registry/README.md)。
- **不证明需求充分。**它只证明「那一天那个提交的这 13 份文件，今天还能逐字节取回」。
