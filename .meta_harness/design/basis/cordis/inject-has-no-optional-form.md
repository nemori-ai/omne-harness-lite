---
id: inject-has-no-optional-form
upstream: cordis
version: 4.0.4
kind: negative
symbols:
  - "fiber.ts: Fiber 构造时遍历 inject 的每一项，任一必需服务缺席即停在 PENDING；inject 没有「可选」写法"
  - "fiber.ts: FiberState.PENDING 的含义是 waiting for required services"
  - "reflect.ts: ctx.get(name, strict=true) 在提供者 fiber 非 ACTIVE 时返回 undefined，不抛错、不登记依赖"
  - "reflect.ts: ctx.get 沿 fiber 链向上解析，同一棵 Context 树里兄弟插件 provide 的服务能被解析到"
lines:
  - "fiber.ts:142-151"
  - "fiber.ts:225-241"
  - "fiber.ts:576-578"
  - "reflect.ts:233-241"
probe: packages.0.0.1.legacy/core/kernel-basis/tests/basis/inject-has-no-optional-form.test.ts
checked: 2026-09-23
---

# `inject` 没有可选形式；可选依赖只能走 `ctx.get`，而 `ctx.get` 看得见整棵树

## 读数

`inject` 列出的每一项都是**必需**服务：Fiber 构造时逐项检查，任一项缺席（或提供者非 `ACTIVE`），
fiber 停在 `PENDING`，插件体不跑。**`inject` 的数组形式与对象形式都是必需**，对象形式的值只是给那项服务的 intercept 配置，
不是「可选」标记。

**想当然的理解**：把一项写进 `inject` 但允许它缺席，插件体自己判断 `undefined`。

**实际（4.0.4 取证）**：写进 `inject` 就等于「没有它我不跑」。要表达可选依赖，唯一的路是不写进 `inject`、
在需要时用 `ctx.get(name)` 现取：提供者不在或非 `ACTIVE` 时返回 `undefined`，出现之后能取到，
而且提供者换代**不会**让调用方重跑（因为没有登记依赖）。

第二件事是这条路的另一面：`ctx.get` 沿 fiber 链向上解析，**同一棵 Context 树里任何插件 provide 到根层的服务，
兄弟插件都取得到**。进程内没有「谁不该看见谁」的边界——想靠「不 inject」来限制某个插件够不着某个服务，是做不到的；
能挡住的只有 isolate 标签下的实例可见性（见 `isolate-hides-instances-not-data`），而那不是访问控制。

两条合起来决定了装配上的两个形状：**「要么整个起来」靠 `inject`**（门只在它消费的服务全部 `ACTIVE` 时才开，否则 `PENDING`，
装配把 `PENDING` 判为清单错误）；**「某插件不得调用某服务」靠结构检查**，不靠内核。

## 证据

| symbol / 语义位置 | 读到了什么 | 怎样复核 |
|---|---|---|
| `fiber.ts` 构造：遍历 `inject` | 每一项都登记为必需依赖；缺席 ⇒ 状态停在 `PENDING` | 用对象形式 `inject: { missing: undefined }` 装一个插件，观察插件体不跑、`fiber.state === PENDING` |
| `fiber.ts` `FiberState` 注释 | `PENDING` = waiting for required services | 读源码 142–151 行 |
| `reflect.ts` `get(name, strict=true)` | 提供者 fiber 非 `ACTIVE` ⇒ 返回 `undefined`；不抛错 | 在没有提供者时 `ctx.get('x')`，得 `undefined` |
| `reflect.ts` 解析沿链向上 | 兄弟插件 provide 的服务能被解析 | 先装消费者、再装提供者，消费者持有的 ctx 能取到提供者的实例 |

## probe 断言什么

probe 在 `packages.0.0.1.legacy/core/kernel-basis`，对 4.0.4 通过（2026-09-22 首跑，2026-09-23 升格为条目）：

1. `inject: { missing: undefined }` 的插件：插件体没跑，`fiber.state` 为 `PENDING`。
2. 不 inject 的消费者：装载时 `resolveOptional(ctx, 'credentials')` 为 `undefined`；随后装一个兄弟插件 provide `credentials`（gen A），
   消费者持有的 ctx 取到 A；dispose 那个提供者后取到 `undefined`；再装 gen B 的提供者取到 B；**消费者插件体自始至终只跑了一次**。

上游若给 `inject` 加上可选形式（缺席不再 `PENDING`），第 1 条失败；若 `ctx.get` 不再解析兄弟 provide、或换代触发未登记依赖的重跑，第 2 条失败——
本条目随之失效，那正是需要的信号。

## 已知的误用

- **把「不 inject」当成访问控制**：以为运维面不 inject 治理服务就够不着它们。够得着——`ctx.get` 看得见整棵树。
  「没有门」要靠结构检查（该单元不引用治理服务名）与通道分离兑现，不靠内核。
- **给长时操作加 inject**：提供者换代会让消费者卸载重跑；真正只想「有就用」的依赖应走 `ctx.get`，并接受 `undefined`。
