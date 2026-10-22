---
id: ctx-property-is-not-ctx-get
upstream: cordis
version: 4.0.4
kind: negative
symbols:
  - "reflect.ts: Context 代理的 get 处理器——插件里读 ctx.<名>，只沿本 fiber 链的 store（inject 了的、或祖先提供的）找，找不到就抛 cannot get property ... without inject"
  - "reflect.ts: 不在插件运行期（根上下文）读 ctx.<名>，等于 ctx.reflect.get(名, false)"
  - "reflect.ts: ctx.get(name, strict) 不看声明，直接读全局服务表"
lines:
  - "reflect.ts:136-168"
  - "reflect.ts:233-243"
probe: packages/assembly/kernel-basis/tests/ctx-property-is-not-ctx-get.spec.ts
checked: 2026-10-02
---

# 插件里读 `ctx.<键>` 不等于 `ctx.get(键)`：前者要先声明，后者直接读服务表

## 读数

在插件体里，`ctx.<键>` 只认沿本插件 fiber 链**声明过**的服务——本插件 `inject` 了的，或某个祖先 fiber 提供或注入的；
链上找不到就抛 `cannot get property "<键>" without inject`。`ctx.get(键)` 不看声明，直接按键读服务表：
提供者在、且（严格读法下）`ACTIVE`，就取得到。

所以两种读法分工明确：`ctx.<键>` 留给 `inject` 过的必需依赖；可选依赖一律 `ctx.get(键)`（或 kernel-basis 的 `resolveOptional`），
并接受 `undefined`。严格与非严格的差别（`ctx.get(键, false)` 也返回提供者尚未 `ACTIVE` 的实现）归
[`inject-has-no-optional-form`](inject-has-no-optional-form.md)，本条不重复。

另有一处容易看漏：**不在插件运行期**（直接在根上下文上）读 `ctx.<键>`，走的是 `ctx.reflect.get(键, false)`——非严格、不要求声明。
在根上下文上写的试验代码因此「能取到」，搬进插件就抛错。

**想当然的理解**：`ctx.<键>` 是 `ctx.get(键)` 的简写，没 inject 也能取，取不到就是 `undefined`。

**实际（4.0.4 取证）**：插件里没声明就读 `ctx.<键>` 抛错；声明了才取得到。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `reflect.ts` Context 代理的 `get` | 运行期沿 `fiber.store` 向上找；遇到本 fiber 声明了却不在场的抛 `in inactive context`；走到没有 `runtime` 的 fiber 或 isolate 标签变了即抛 `without inject` | 读源码 136–168 行 |
| 同上，第 152 行 | `if (!ctx.fiber.runtime) return ctx.reflect.get(prop, false)` | 在根上下文读一个已提供的键 |
| `reflect.ts` `get`／`_getImpl` | 按 isolate 键读 `this.store`，不查声明 | 读源码 233–243 行 |

## probe 断言什么

probe 在 `packages/assembly/kernel-basis/tests/`，随该成员的测试运行。对 4.0.4 通过（2026-10-02）；2026-10-22 迁入该成员后对 4.0.4 复跑通过：

1. 一个插件提供 `probeKv`；另一个**没 inject** 的插件体里，`ctx.get('probeKv')` 取到实现，读 `ctx.probeKv` 抛错且消息含键名。
2. `inject: ['probeKv']` 的插件体里，`ctx.probeKv` 取到同一个实现。

上游若让未声明的 `ctx.<键>` 也能取到（第 1 条的抛错消失），本条目失效——那时「`ctx.<键>` 只留给 inject 过的键」这条约定就失去了内核一侧的依据。

## 已知的误用

- **可选依赖写成 `ctx.<键>`**：提供者在、而本插件恰好有祖先声明过它时能取到，换个装配位置就抛错——依赖拓扑的读法。
- **在根上下文上试通了就当插件里也行**：根上下文的属性读法是非严格 `get`，插件里不是。
