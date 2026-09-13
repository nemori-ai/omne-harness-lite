---
kind: decision
id: D-006
status: accepted
scope: 本批 DSH 核心能力源码集合、有限支撑来源、依赖裁剪和逐专题设计验收门槛
date: 2026-09-13
sources:
  - ../proposals/dsh-core-adoption/README.md
acceptance: ../proposals/dsh-core-adoption/README.md#接受记录
supersedes: []
---

# D-006：固定本批 DSH 源码集合，按能力设计后定向复用

## 选择

采用[来源集合](../proposals/dsh-core-adoption/selection.md)：10 个主体来源为
scope、agent、session、session-projection、session-persistence、
session-persistence-jsonl、agent-loop、system-prompt、tools、llm；
4 个限定支撑来源为 brand、util-values、timeout、attachment。
此处均指 `@deepseek-ai/dsh-*`，精确范围、来源与排除项由集合正文拥有。

Cordis 继续直接使用官方发布包。其余选定 DSH 源码由本项目维护和二次开发，
源码来源包不与目标包、服务、能力或部署单元一一对应。所有产品协议、保证和
政策由本项目定义；不采用完整 DSH Harness，不为其应用政策保留兼容层。

普通 JSONL 后端只定向取用适合的源码，排除上游历史格式迁移与压缩/native 路径；
具体平台、写入权、耐久确认和恢复保证必须完成设计与验证。支撑包只取必要部分，
共享身份和媒体内容契约不得随来源复制成多份权威定义。

**tools 和 LLM 各自必须完成新的项目架构设计、独立评审与接受，才能进入对应
源码导入和二次开发。** tools 沿用已保存的候选输入；LLM 围绕统一 OpenRouter、
模型切换、多模态、请求治理和费用归因建模。Session/Run/上下文装配等尚缺契约
同样遵循[阶段计划](../proposals/dsh-core-adoption/design-plan.md)，不因选择源码跳过设计。

## 理由与取舍

仅保留 agent 源原语不能形成模型、工具和耐久会话的闭环；全量搬入上游包则会
带入 Typert、设置、格式历史和应用政策等不适合的边界。从零重写全部机制也没有
充分收益依据。本次固定有明确机制价值的源码来源，在语义拥有处按目标规格修改。

代价是维护裁剪、接口重组和源差异，并逐次验证真实依赖闭包；不能用上游测试
通过证明目标契约满足。定向复用允许删除无用部分，不要求最终保留 14 个独立包。
扩张来源或取消既定排除范围须先修订采用选择及受影响设计。

## 接受边界

需求基线为 `dae2df36491c0ab4b8b9a3d16db639dab5ea88b0`；身份、确认条款、当时
路径、覆盖缺口和独立恢复证据见[需求消费](../proposals/dsh-core-adoption/requirements.md)。
接受授权与实际评审分别见[接受记录](../proposals/dsh-core-adoption/README.md#接受记录)
和[评审](../proposals/dsh-core-adoption/review.md)。

本决定补充 SYS-KERNEL 的具体选用范围，不取代 D-005 或改变已发布规格。接受的是
本批来源与阶段边界，不是完整 tools/LLM/Session/Run 架构、可安装依赖闭包或产品
闭环已完成。排除 jobs、approval、设置和环境等来源，不豁免后台、HITL、授权、
预算、媒体治理及其它产品义务；下一步必须落实相邻契约和实际提供者。
