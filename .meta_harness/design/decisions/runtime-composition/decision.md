# D-007：独立状态权威与受管附着

- 当前状态：已接受；实现、装配和验证状态分别核对，不由本决定自动升级
- 来源修订：e3573ca72d18bfe7ddd002df5025551b51eede46
- 来源决定：docs/decisions/D-007-runtime-composition.md
- 来源 SHA-256：bb9572b1ce2c8cb2b4e56010fd7c14b04e178afec24a6f24d68cf0d0171e9a2f
- 接受日期：2026-09-13
- 实际接受依据：用户授权共同边界设计；任务作者在受审修订 adafb2dc1bb8db19e2aac40567feb607aa97bdbe 上接受有限设计。

## 选择与范围

1. Session 拥有长期事实，Agent 原语拥有临时活体占位与资源退出；输入和 Run 控制、工具执行、模型请求、上下文装配各自拥有业务事实。
2. Cordis Context、调用上下文和模型内容分别表达；scope 可见性与 initiator 因果归因不授权。
3. Factory 是受管贡献，Registry 不静态依赖具体 Loop；能力经服务与受限运行对象组合。
4. 激活在共同撤销屏障内复核权限、附着和绑定。资格失效不复活旧尝试，真实静止和资源释放后才解除占位；独立后台工作须由权威接管。

适用范围：共同能力归属、四类运行提供者交接和 Agent 与 Session 附着组合。

## 需求消费基线

原接受消费 `dae2df36491c0ab4b8b9a3d16db639dab5ea88b0` 的确认需求；逐项旧覆盖记录为
`e3573ca:docs/proposals/runtime-composition/requirements.md`（SHA-256
`51ae360ef4d94484b8f16acbb21888a78cb27b617bb6b9ba695d0`）。
本决定回应[系统约束](../../requirements/system/constraints/requirements.md)、[动态能力分离](../../requirements/system/fully-dynamic-system/requirements.md)、
[运行态连续性](../../requirements/system/runtime-state-and-continuity/requirements.md)、
[Session/Run 控制](../../requirements/product/PF-013-session-run-lifecycle-and-pending-input-control/requirements.md)与
[依赖降级](../../requirements/product/PF-020-dependency-availability-and-degradation/requirements.md)中的共同附着与撤销边界；
完整业务状态、跨进程接管、模型/工具/媒体协议及真实提供者符合性不由此决定完成。
当前需求的具体版本与变化由 requirements family 拥有，旧消费基线不自动升级。

## 理由与保留前提

准备前单次检查无法覆盖并发撤权和撤除，共享可变 Session 也无法保护恢复；精确附着把有效期和资源责任变为可验证义务。

精确交接由 Agent 与 Session binding 拥有，当前系统视图见运行时组合。

## 取代与影响

补充 D-005 和 D-006；后续生命周期和工具或消息决定增加业务协议，但不合并本决定的独立权威。

原决定、旧评审和旧实现证据只证明其记录的对象与时点。当前规格采用、提供者符合性、应用装配与发布仍须分别引用实际
catalog、review、formal execution、provider conformance 和 release evidence；本包不会把这些状态合并为“已交付”。
