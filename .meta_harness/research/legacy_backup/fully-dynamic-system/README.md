---
kind: research
id: R-fully-dynamic-system-origin
scope: omne-next 完全动态系统定义的原文、完整未过滤祖先历史与时间线
---

# 完全动态系统：原文与历史来源

本信息包保存 `SYS-DYNAMIC.C1` 明确采用的定义、早期原稿，以及可在没有
`omne-next` 源检出的情况下独立恢复的 Git 历史证据。

- 来源仓库：`https://github.com/nemori-ai/omne-next`
- 采用快照：`5d6322d85652f17b72cf97043b6300926c41083a`
- 本次迁移源：`docs/research/fully-dynamic-system/` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 系统目标采用的中文定义 | [中文定义](fully-dynamic-system.zh.md) |
| 同期英文表述 | [英文版本](fully-dynamic-system.md) |
| 最早保留的原稿 | [早期原稿](fully_dynamic_system_intro.md) |
| 哪些提交形成了文档时间线 | [历史日志](history.log) |
| 怎样独立恢复完整祖先历史 | [Git bundle](omne-next-history.bundle) |
| 来源、哈希、范围与证据局限 | [证据记录](evidence.md) / [provenance.json](provenance.json) / [SHA256SUMS](SHA256SUMS) |

## 当前文件与原始字节

当前三份 Markdown 定义是供设计链阅读的迁移副本。其中英文和中文文件只移除了
源文件末尾的一个换行字节，早期原稿与源文件字节一致；`provenance.json` 分别记录
源和当前目标的 SHA-256。它们不能笼统称为三份原字节副本。

原始 Git blob、父链、树对象及提交元数据保存在 bundle 中。bundle 未按路径过滤、
没有重写提交，包含采用快照 `5d6322…` 的全部 237 个可达祖先提交，因此也包含这些
历史树中的其他源文件。它不包含采用快照之后的 `omne-next` 历史。

## 时间与采用边界

Git 对象保存作者时间、提交者时间和已有签名，但这些时间可由提交者设置。本包没有
执行签名身份验证或独立可信时间戳核验，不能据此断言思想首次形成或首次公开发表的
时间。完整限制、恢复命令和已验证范围见[证据记录](evidence.md)。

关于外部框架的比较未在本轮重新核验，不能作为相关产品当前版本事实。原定义“任一
维度”与“全部 MVC-4”的量词差异继续是 `SYS-DYNAMIC` 的待澄清项。
