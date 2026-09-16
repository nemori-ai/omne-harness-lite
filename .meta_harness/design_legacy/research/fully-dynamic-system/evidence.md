# 完全动态系统来源的证据边界

## 保存内容

- 当前消费者：`SYS-DYNAMIC.C1` 的定义来源。
- 迁移源：`docs/research/fully-dynamic-system/` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`。
- 采用快照：`5d6322d85652f17b72cf97043b6300926c41083a`，也是这组三份文档最后发生修改的提交。
- 阅读副本：双语定义与早期原稿；源/目标字节差异和哈希见 `provenance.json`。
- 历史载体：原字节的 `history.log` 与 `omne-next-history.bundle`。bundle 的 SHA-256 是
  `52956ee7959037a29fd2f394bc80874925e56f930f13acca0a0f9b2f8dced50e`，保存 ref
  `refs/heads/omne-next-definition-history`，tip 为采用快照，共有 237 个可达提交。

bundle 保存截至采用快照的完整、未按路径过滤的祖先历史，包括其他源文件所在的树；
它没有重写提交，可独立恢复原始对象。它不包含采用快照之后的仓库历史，也不声称保存
`omne-next` 在所有 remote、分支或不可达对象中的全部历史。

## 文档时间线

| 作者时间 / 提交者时间 | 原始提交 | 变化 |
|---|---|---|
| 2025-09-17 19:55:34 +08:00 | `111d3220e8f41a4640d0b1345e6884d0f23d84a9` | 根目录首次加入 `fully_dynamic_system_intro.md` |
| 2025-09-22 13:27:56 +08:00 | `72b9e2a933e5e7f3b22fa88e48a588d176ced97b` | 原稿移至 `docs/fully_dynamic_system_intro.md`，内容不变 |
| 2025-12-08 19:46:28 +08:00 | `f4a519b1548de7ee82815fa5b73f168d9aec539d` | 原稿移至 `docs.deprecated/`，内容不变；新增中英文文档 |
| 2025-12-09 16:38:23 +08:00 | `5d6322d85652f17b72cf97043b6300926c41083a` | 中英文文档移除章节间分隔线 |

这四个历史提交的完整作者/提交者字段、父提交、签名字段和路径变化可从
[history.log](history.log) 与 [bundle](omne-next-history.bundle) 直接核对。

## 内容身份与局限

`SHA256SUMS` 检查当前包内文件的字节身份；`provenance.json` 另外记录迁移前来源
Markdown 与当前阅读副本的哈希。当前英文和中文阅读副本分别比源文件少一个末尾换行，
早期原稿保持原字节；源快照中的原始 blob 仍可从 bundle 读取。

Git 作者时间和提交者时间不是独立可信时间戳。本包保留已有签名字节，但未验证签名者
身份或签名信任链。证据因此支持内容、对象、父链、采用快照及仓库所记录的时间线，不证明
思想首次形成时间、首次公开时间、签名身份、当前实现符合性或待澄清量词。

## 校验与独立恢复

从本目录检查所有列入清单的当前资源：

```sh
sha256sum --check SHA256SUMS
git bundle verify omne-next-history.bundle
```

从仓库根在一个尚不存在的临时目录恢复并核对：

```sh
git clone --bare --branch omne-next-definition-history \
  .meta_harness/design/research/fully-dynamic-system/omne-next-history.bundle \
  tmp/omne-next-dynamic-history.git
git -C tmp/omne-next-dynamic-history.git fsck --full
git -C tmp/omne-next-dynamic-history.git rev-list --count \
  refs/heads/omne-next-definition-history
git -C tmp/omne-next-dynamic-history.git show \
  111d3220e8f41a4640d0b1345e6884d0f23d84a9:fully_dynamic_system_intro.md
```

恢复不依赖原 `omne-next` 工作区，也不需要网络。旧 README、清单和 provenance 的迁移
处置与固定恢复坐标见[来源处置](../../requirements/source-disposition.md)。
