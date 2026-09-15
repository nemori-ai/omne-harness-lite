---
kind: decision
id: D-007
status: accepted
scope: D-006 工作 A 的共同能力归属、四类运行提供者交接及 Agent/Session 附着组合 v1
date: 2026-09-13
sources:
  - ../proposals/runtime-composition/README.md
acceptance: ../proposals/runtime-composition/README.md#接受记录
supersedes: []
---

# D-007：以独立状态权威和受管附着组合 Agent 运行时

## 选择

接受[共同边界设计](../proposals/runtime-composition/design.md)的能力归属与 Cordis
映射：Session 拥有长期会话事实，Agent 原语拥有临时活体占位与资源退出，输入/Run
控制、工具执行、模型请求及上下文装配分别拥有自己的业务事实和规则。存储兑现
保存/读取，供应商消息作为共享内容的边界投影，不成为共享数据的上层权威。

Cordis Context、调用上下文和一次模型请求的内容分别表达；scope 的贡献可见性、
initiator 的因果归因不授予权限，也不改变状态或后台资源的所有者。

发布 [composition.agent-session-binding v1](../../spec/compositions/agent-session-binding/v1/contract.md)，
细化 D-005 的四类提供者交接：当前访问验证、Session 运行附着、Factory/驱动、
资源与贡献使用。Factory 是向 agents 注册的受管贡献，Registry 不静态依赖具体
Loop；能力通过服务和受限运行对象组合，不要求四个包装服务或源包一对一映射。

激活在共同撤销屏障内复核当前权限、精确附着和必要绑定，再发布原 AgentRef。
异步准备先登记回收责任；资格失效不复活旧尝试；真实静止和必要资源释放完成后
才解除占位。计划卸载先协作收口；独立后台工作须由其权威确认接管，不能因临时
实例销毁而遗失。精确操作、失败及竞争语义由组合规格唯一维护。

## 理由与取舍

准备前的一次检查无法覆盖准备期间的撤权、归档或提供者撤除。直接共享可变 Session
对象或把长期 Session 挂在临时 Agent 下，也无法兑现权限、恢复与后台存续要求。
精确附着和受管使用把授权、有效期、资源责任及释放结果变为可验证的交接义务。

代价是提供者须共同兑现短提交边界、未知结果核实与清理责任。首版沿用一个逻辑
协调权威；不新增通用分布式事务框架，不把注入成功当作就绪，也不修改官方 Cordis。
未来跨进程提供者必须保持同等可观察语义，不能直接序列化运行时能力。

## 接受边界

需求基线 `dae2df36491c0ab4b8b9a3d16db639dab5ea88b0` 的确认条款、逐项覆盖、
交接来源及独立恢复证据见[需求消费](../proposals/runtime-composition/requirements.md)。
评审与作者接受分别见[评审记录](../proposals/runtime-composition/review.md)和
[接受记录](../proposals/runtime-composition/README.md#接受记录)。

本决定补充 D-005/D-006，沿用 identity/live-agent v1，不取代或修改已发布版本。
本次接受的是工作 A 的共同边界和附着组合；完整 Session 日志/Run/输入控制、
工具、LLM、内容/媒体结构与装配协议继续按各专题设计。接受不表示实际提供者
已实现共同屏障、产品闭环已具备或无条件活性已证明。
