# 需求基线保留与恢复

[需求维护](../../maintenance/requirements.md#基线保留) · [本次迁移](../../maintenance/migrations/2026-09-12-requirements-foundation.md)

本目录保存正式需求快照的历史证据，不是当前需求正文或第二份需求注册表。
当前目标继续在 [requirements](../../requirements/README.md) 演进；消费设计需要明确
它采用的 ID、确认条款、提交与当时路径。

## 2026-09-12 初始基线

- 提交：`8688fe36a9d3d23edabd2f8c7a436b73cc15f34c`。
- 保留引用：`refs/tags/requirements-baseline/2026-09-12-foundation`，不可改指或删除。
- [自包含历史包](2026-09-12-foundation.bundle)：9,394,982 字节；包含该引用及全部
  必需祖先、提交与树对象，不依赖开发分支、同机仓库或 alternates。
- [来源与逐文件 SHA-256](2026-09-12-foundation.json)：记录 bundle 哈希及 13 份
  需求文件的当时字节，包括确认范围、补充和未决内容。

本次在源仓库建立保留 tag，并将自包含 bundle 随本仓库跟踪交付；即使未来交付
采用 squash 且没有自动传递 tag，也可由 bundle 恢复原提交和引用。本轮未推送远端，
不声称远端保存完成。以后若迁移本目录，先按需求维护规则完成保全和恢复入口更新。

该包也包含当时其他受跟踪文件及祖先；这是原提交对象完整性的代价，不能将其中
候选、研究或早期正文当作已接受产品契约。原 omne-next 定义的独立历史包仍归
[动态来源](../fully-dynamic-system/README.md)，两者证明的快照范围不同。

## 实际恢复验证

本次使用全新空仓库，仅从本包取回保留 tag，检出 detached HEAD；没有本地开发
分支、远端引用或 alternates。清除该测试仓库的 reflog 并执行 GC 后，仍成功恢复
上述 commit，逐字节核对全部 13 份需求文件，并通过 `git fsck --full`。

从包含此目录的仓库根可按以下方式复核。路径仅供新的测试仓库；已有同名目录时
命令停止，不清理其他任务资产。

```sh
set -eu
mkdir -p tmp
mkdir tmp/requirements-foundation-recovery
git -C tmp/requirements-foundation-recovery init -q
git -C tmp/requirements-foundation-recovery fetch   "$PWD/docs/research/requirements-baselines/2026-09-12-foundation.bundle"   refs/tags/requirements-baseline/2026-09-12-foundation:refs/tags/requirements-baseline/2026-09-12-foundation
git -C tmp/requirements-foundation-recovery checkout --detach requirements-baseline/2026-09-12-foundation
git -C tmp/requirements-foundation-recovery for-each-ref --format='%(refname)' refs/heads refs/remotes
git -C tmp/requirements-foundation-recovery reflog expire --expire=now --all
git -C tmp/requirements-foundation-recovery gc --prune=now
git -C tmp/requirements-foundation-recovery rev-parse 'refs/tags/requirements-baseline/2026-09-12-foundation^{commit}'
git -C tmp/requirements-foundation-recovery fsck --full
```

`for-each-ref` 应无输出，rev-parse 应恢复所记提交。随后按 JSON 中逐文件 SHA-256
核对测试检出的 `docs/requirements/`。这些结果验证对象保留与内容恢复，不证明
需求的充分性、Git 日期是可信时间戳或产品已兑现要求。
