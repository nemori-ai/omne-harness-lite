# 固定 JSON Schema 的编译开销与可用的预编译、缓存手段

GitHub issue #65 的前置调查：本仓库各包在**模块顶层**编译自己的固定 JSON Schema，导入一个包就付全部编译。
这项调查要区分四件事：这笔钱花在哪、各占多少；只把编译推迟到首用能省多少；
构建期预编译（Ajv standalone）能不能承载本仓库的 exact 关键字、要付什么；
跨进程的缓存手段（Node compile cache、按内容哈希的磁盘缓存）对哪一种编译有效。
它能回答「每条路在本仓库的条件下成立到哪、撞上什么」；**不能**回答该走哪条路，也没有量过任何一条路对整张导入图、
CLI 启动或整套测试的收益——那归 #65 的提案与决定。

- 调查对象与基线：本仓库 `ff57fc8e3`（工作树 `test-tiers-mutation`，`packages/core/*/dist` 构建于 2026-10-02 10:13，
  源码末次变更 `99d8a08af`）；Ajv `8.20.0`（仓库锁定，`node_modules/.pnpm/ajv@8.20.0`）；Node `v24.21.0`；
  替代库 `typebox@1.3.34`、`@sinclair/typebox@0.34.52`、`@exodus/schemasafe@1.3.0`、`@cfworker/json-schema@4.1.1`、`@hyperjump/json-schema@1.17.8`；
  同行 DSH `639ed015`、pi `a13d35a7`（v1.0.0）；取证 2026-10-02。
- 消费者：#65 的提案与决定（待出现于 record/proposals、record/decisions）。
- 最近核对：2026-10-02 / 上述版本。

## 准入核对

- **对象与版本**：版本 token 集中在 [evidence.md 页首](evidence.md)，上游升级时按 token grep。
- **取得方式**：Ajv 与 content-blocks 的结论来自源码逐行核对（行号钉在 Ajv `8.20.0` 与仓库 `ff57fc8e3`）和 Ajv `v8.20.0` 标签下的官方文档原文；
  Node compile cache 来自 `v24.21.0` 标签下的 `doc/api/module.md` 原文；对拍、导入耗时、分段计时、按需对照与 pattern 去重反例由主线**本轮复跑或自建探针**，
  记下了当时负载。三份子代理报告是输入不是证据，原貌（删去对本项目的方案建议）存在 [reports/](reports/)，逐条的核对状态在 [evidence.md](evidence.md)。
- **来源立场**：Ajv、Node 文档是作者自述，只证明它宣称什么；短板与退化条件取自源码、复跑与本轮构造的反例。替代库的耗时与部分能力判断、vitest 探针、
  哈希缓存原型、Kimi／Cursor 两家的取证只有子代理转述，未复跑，已在证据里逐条标出。
- **局限**：机器 8 核、测量期间 load1 在 6.7–17 之间漂移，绝对毫秒数只在同轮交替测量内可比；只在 messages、tool-definition 与元校验器三处生成过 standalone 产物，
  其余约二十个包没有；没有量整张导入图（`model-request-runtime`、`omne --help`）与 vitest 下的收益；Ajv 的 issue tracker 未检索。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 现在应该相信什么（十二条结论 C-1～C-12、支撑假设、未知） | [研究正文](research.md) |
| 每条观察出自哪个文件哪一行、怎么复跑、当时负载多少、支持到哪 | [证据记录](evidence.md) |
| 三份子代理报告当时的原貌（现状地图、同行、通用库与探路件） | [历次报告](reports/) 按日期取用 |

探路件与原始输出在会话临时目录（可能已清理），路径与复现命令列在 [evidence.md 的探路件清单](evidence.md#探路件清单与复现命令)。
只读研究正文就知道当前该信什么；要追某个数字是谁在什么负载下量的，再展开证据记录。

## 2026-10-03 接续

原稿作为前次研究保全，不把当时未出现的决定或未复跑报告改为已接受。新增实际观察见[本轮目录](2026-10-03/README.md)，消费入口为正式候选提案。当前仍没有全导入图／CLI／PI／全成员五轮交替性能结论。

原上游文档快照与前次输出归upstream；原Markdown按原文文本保留，字节摘要未变。只有本topic的研究正文参与本仓库导航。
