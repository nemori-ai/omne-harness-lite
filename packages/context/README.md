# 运行感知与一次模型请求能力组

`request-context` 和 `runtime-context` 已是 workspace 草稿，公开行为尚未实现。旧的 `packages.0.0.1.legacy/core/runtime-context` 不在 workspace 里。以下文档目标不授予实现或接受。

## 责任与范围

工程范围由[领域责任](../../docs/domains/runtime-context/README.md)与[产品正文](../../.meta_harness/design/product/runtime-context/design.md)约束。本组拥有成员分解、公开依赖、组协作及组合验证导航。

## 成员与依赖

目标成员的职责、状态和读取顺序从[runtime-context 入口](runtime-context/README.md)、[request-context 入口](request-context/README.md)进入，再按任务核对下面的规格与专题。


状态：候选、待用户确认。组根只维护成员导航和工程关系，不设合并 SPEC、运行入口或实际 `package.json`。

| 目标成员 | 完整必要行为 | 责任 |
| --- | --- | --- |
| `context/runtime-context` | [SPEC](runtime-context/SPEC.md) | 注册供给、当前读取、消费者边界、变化与恢复协作 |
| `context/request-context` | [SPEC](request-context/SPEC.md) | 请求投影、模态选择、全预算、压缩与最终采用协作 |

两个成员经公开保证协作。原内容及资格仍归生产者，本会话选择归 Session，最终一致采用归发起协调者。Request Context 不反向改 Runtime Context 原数据，不直接读取其私有实现。独立使用按成员自身前提承接依赖，不强制创建 Session 或启用 Cordis。

[产品规则](../../.meta_harness/design/product/runtime-context/design.md)说明业务后果，[领域架构](../../docs/domains/runtime-context/architecture.md)说明交接，依据与缺项由当前正文及技术拥有者维护定位冻结依据。共享的资格、发出前复核、历史保全与耐久交接由实际协调者联合验证；两份 SPEC 保留成员持续验证义务。

这里仅镜像具名目标。提供者、适配、实际 API 和实现尚未采用，成员目录存在不授权开包。MODEL-E01 和在途保留缺项沿[问题登记](../../.meta_harness/design/product/runtime-context/design.md#未决问题与待定事项)接续。

[九条产品旅程](../../.meta_harness/design/product/runtime-context/design.md#关键用户旅程)及[关键流程](docs/key-flows.md)连接 CAP-RC01 至 CAP-RC10 与两成员的持续验证场景。转换件共同技术契约仍归 [Model](../model/model/docs/profile-and-modality.md#转换件的共同契约)，本组只承担接纳投影、表示采用与请求计算责任。阶段清单待用户选择，目标成员目录与候选通过检查均不授予阶段支持。


工程关系见[组设计](docs/architecture.md)。成员目标已有文档，不等于真实包；公开入口、安装闭包和提供者映射尚待设计。

## 关键协作

runtime-context 按合法注册与原生产者资格供给当前块和变化，request-context 经公开契约消费这些输入并计算投影、模态、完整预算与压缩。Session 保存注册与自有值，最终发起协调者固定一致采用，两成员不互读私有实现。

流程从[组协作入口](docs/key-flows.md)导航到协调成员。

## 组合验证

两个成员分别验证供给与派生行为。最终发起与消费协调者联合验证当前资格、输入一致采用、历史保全、压缩保护及耐久交接；Session和原生产者承担恢复事实及读取依据。组合资源与真实模型、工具、存储、并发、断电及性能执行证据仍缺。

## 维护

修改行为同步成员SPEC、原具名专题、实际消费者及相称验证；修改工程分解同步组导航和登记。具名维护人尚缺，由项目负责人指定；职责拥有者不等于已派发个人。产品、组工程和成员机制分别维护唯一正文。
