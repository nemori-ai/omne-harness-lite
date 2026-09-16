# D-006：DSH 核心来源的定向复用

- 当前状态：已接受；实现、装配和验证状态分别核对，不由本决定自动升级
- 来源修订：e3573ca72d18bfe7ddd002df5025551b51eede46
- 来源决定：docs/decisions/D-006-dsh-core-adoption.md
- 来源 SHA-256：fee64c45df075b30469c095c9c303ca848af096dd5c8d3e5bb71c56e24712058
- 接受日期：2026-09-13
- 实际接受依据：用户要求正式确定 fork 和二次开发集合；任务作者在维护边界、来源核对和独立评审后接受具体集合与阶段门槛。

## 选择与范围

1. 主体来源固定为 scope、agent、session、session-projection、session-persistence、session-persistence-jsonl、agent-loop、system-prompt、tools、llm；支撑来源限 brand、util-values、timeout、attachment。
2. Cordis 使用官方发布包；其余选中源码由项目 fork。来源包不等于目标能力、插件、服务或部署单元。
3. 不采用完整 DSH Harness 或其应用政策；JSONL 等机制只定向取用，耐久、授权、身份和恢复保证由本项目契约拥有。
4. tools、LLM 及其他缺契约专题须先完成项目设计、独立评审与接受，再进入导入和二次开发。

适用范围：本批 DSH 源码来源、排除项、依赖裁剪与进入专题实现前的设计门槛。

## 理由与保留前提

只保留 agent 原语无法形成闭环，全量引入会携带不适用政策，从零重写又缺少收益；定向复用把语义留在产品拥有者。

来源事实与排除边界见 DSH 采用提案；核对上游 API 时使用 Cordis 权威来源指导。

## 取代与影响

未被取代。新增来源或取消排除项须重新接受；后续专题设计不把来源选择当作产品符合性。

原决定、旧评审和旧实现证据只证明其记录的对象与时点。当前规格采用、提供者符合性、应用装配与发布仍须分别引用实际
catalog、review、formal execution、provider conformance 和 release evidence；本包不会把这些状态合并为“已交付”。
