---
id: PD-model-invocation
title: 模型调用
status: accepted
revision: 3
relations:
  supersedes: []
  depends-on: []
  extends: []
---

# 模型调用

本 topic 的产品设计已正式接受。会话内工具名称与参数形状一致的约束依据 [RFC-0012](../../../../docs/rfcs/RFC-0012-tool-dynamics.md) 及 [#618 的决定](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6314971717)写回，产品负责人已于 2026-10-22 接受该写回，见[#618 的接受决定](https://github.com/nemori-ai/omne-harness-lite/issues/618#issuecomment-6335123860)。正文定义的全部能力 CAP-MD01 至 CAP-MD13 纳入 `0.0.0 → 0.1.0` 完整交付承诺，包含相关需求、用户旅程、失败边界与跨领域协作。本域现有非 pi-ai 技术设计也已接受；pi-ai 相关细化仍为候选。实际实现、行为验证及交付接受仍须取得证据，精确技术范围由各技术拥有者正文维护。

## 阅读入口

- [派生验收场景](acceptance.md)登记现行产品的三条持续验证路径。
- [产品正文](design.md)包含需求、能力状态、阶段承诺及未决事项。
- [领域责任](../../../../docs/domains/model-invocation/README.md)解释已接受分工与采用范围。
- [能力组](../../../../packages/model/README.md)导航工程关系及成员契约。

## 维护

产品规则与阶段选择由产品负责人确认。技术及来源问题由正文第四块指向唯一技术拥有者。实现支持与验证须有实际提供者、精确版本和装配证据；文档整理不替代。形成过程、逐轮评审与原问答继续留任务tmp。
