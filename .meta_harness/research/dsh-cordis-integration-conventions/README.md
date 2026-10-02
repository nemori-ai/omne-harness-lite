# DeepSeek Harness 在 Cordis 之上的集成约定

本项目把 Cordis 定为装配契约之后，需要一份「做出来的东西怎样以 Cordis 插件与服务的方式集成」的约定。本调查读 DeepSeek Harness（DSH）在 Cordis 之上立的规矩，
区分哪些是 Cordis 本身的语义、哪些是 DSH 加的，每条由什么守住、哪里没守住。当前观察支持一张 17 条的约定表（含 3 条缺口）与「本仓库所装的 Cordis 就是 DSH 的 fork」；
还不能支持任何关于 DSH 运行时行为的结论——本 topic 只读了文字与脚本。

- 调查对象与基线：deepseek-ai/deepseek-harness master `639ed015397290b3745d163aafe02ffee4aa3f84`（2026-09-29，`dsh-root` 0.2.0-rc.2）；本仓库主线 `a68f1558b`。
- 消费者：#53／#46 合并方案（主检出 `tmp/arch-intent/plan.md`）的阶段 3（本项目的 Cordis 集成约定与 D-114）、阶段 6a 与 7（约定符合性读数）、阶段 8a（Agent 平面作用域试点）；
  同期的 [架构判断辅助调研](../architecture-judgment-aids/README.md)。
- 最近核对：2026-10-02 / DSH `639ed015`。

## 准入核对

对象是一个精确提交，源码归档在主检出 `tmp/sources/`，带哈希与取法；约定表每行的出处由主线逐行核过。
局限：只读文档、约定与生成脚本，没有运行 DSH，也没有读 `dsh-scope` 等运行时机制的实现；DSH 与它的产品绑定的约定（会话与 agent 模型、浏览器端与宿主两套编译面、Typert、i18n 元数据）没有收。
DSH 概念一律保留原文名，不在本 topic 起中文名。

## 按当前问题展开

| 当前问题                   | 阅读入口                |
| -------------------------- | ----------------------- |
| 现在应该相信什么           | [研究正文](research.md) |
| 来源、实验或反例是否可复核 | [证据记录](evidence.md) |
