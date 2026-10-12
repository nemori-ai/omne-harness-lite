# 架构内核与扩展

**这一卷回答：这个系统哪一部分立规矩，其余部分怎么建在它之上。**

```text
   ┌─────────────────── 架构内核 ───────────────────┐
   │  概念在这里定义 · 边界在这里划 · 协议在这里立   │
   └──────────────────────┬─────────────────────────┘
                          │  其余部分消费，不重新定义
                          ▼
              实现 · 扩展 · 更具体的能力
```

**收在这里的是「哪一部分是根基」这个问题的答案**，以及**其余部分接到根基上的那几样位点与数据**——
一项可替换能力在装配上从哪里接进来、各方担什么角色，一个进程启动时由哪些 Cordis 插件叠成。
根基里的具体对象各归其卷：**谁在用**归[主体与归属](subjects-and-ownership.md)，
**agent 由什么构成**归[能力与构成](capabilities-and-composition.md)，
**一段协作怎么走完**归 [Agent 运行时闭环](agent-runtime-loop.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

> **本卷的词条都不归任何一个 topic**：架构内核横跨全部架构内核 topic，
> 能力接缝与 Cordis 插件树是装配上的说法，没有产品 topic 拥有它们。
> 依据分别在 [现行词义](../index.md) 与 [现行词义](../index.md)。

## 词条

### UL-architecture-core · 架构内核 · Architecture Core

> **中**：系统里**立规矩**的那一部分——概念在这里定义、边界在这里划、
> 其余部分必须遵守的协议在这里立；其余部分**消费**它们，不重新定义。
> 它由[架构内核 PF 索引](../../product.0.0.1.legacy/architecture-core.md)登记的那批产品设计 topic
> 所覆盖的对象、层与领域构成，**那份清单会随设计生长而增补**。
>
> **EN**: The part of the system that **establishes the rules** — where concepts are
> defined, boundaries are drawn, and the protocols everything else must obey are
> set. The rest **consumes** them rather than redefining them. It consists of the
> objects, layers and domains covered by the product-design topics registered in
> the [architecture-core PF index](../../product.0.0.1.legacy/architecture-core.md), a set that
> grows as the design grows.

- **形态**：总称
- **出处**：[现行词义](../index.md)（产品负责人 2026-09-20 直接裁决）
- **判据**：拿一样东西问——**它是在立规矩，还是在用规矩？**立，在架构内核内；用，在外。
- **别混 ①**：与**上游内核不是一回事**。本项目仅复用 Cordis 官方包，不复用 DSH `agent` 原语；
  SYS-KERNEL约束这项技术底座——[它到底保证什么归 basis](../../basis/README.md)；
  **架构内核是我们自己定义的那部分架构**，站在那之上。
  **承载仓库的常驻指令把那层叫「内核层」**（[承载位置的约定不是本工作区的设计权威](../../../AGENTS.md)，
  这里只当撞名事实引用）。**正因为撞名，这个词不裸用「内核」二字**，正式名始终带「架构」。
- **别混 ②**：它**不是那批 PF 本身**。PF 是**设计材料**，架构内核是那些材料**所描述的那部分系统**——
  给索引页加一个 PF，是**认定**某块内容属于架构内核，不是**造出**一块新的架构内核。
- **弃用**：~~`Harness Core` / 「harness 内核」~~——**不是错**，
  [现行词义](../index.md)；
  **但正文统一写正式名**，理由见那条裁决。

### UL-capability-seam · 能力接缝 · Capability Seam

> **中**：一项可替换能力在装配上**接进来的那个位点**：恰一个
> [Cordis 服务定义](#ul-cordis-service-definition--cordis-服务定义--cordis-service-definition)给它一个服务键与一套词汇类型，
> 一个或多个 [Cordis 服务提供者](#ul-cordis-service-provider--cordis-服务提供者--cordis-service-provider)在这个键上兑现它，
> 一个或多个 [Cordis 服务消费者](#ul-cordis-service-consumer--cordis-服务消费者--cordis-service-consumer)按这个键取用它。
> **三个角色合起来才是一个接缝**；只说其中一个角色，不叫接缝。
>
> **EN**: The point at which one swappable capability is plugged into the assembled system:
> exactly one Cordis service definition gives it a service key and a set of vocabulary types,
> one or more Cordis service providers fulfil it under that key, and one or more Cordis service
> consumers use it through that key. **A seam is the three roles together**; no single role
> on its own is a seam.

- **形态**：位置
- **出处**：[现行词义](../index.md)（产品负责人 2026-10-02 直接裁决）
- **别混 ①**：不是那项能力的契约。契约写性质与保证；接缝是它在装配上落成的位点，一个服务键一个接缝。
- **别混 ②**：不是 [Loop 拓展点](agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)——
  拓展点是 agent loop 运行流程上挂拓展件的位置，接缝是一项能力的接入位，与 loop 走到哪一步无关。
- **弃用**：~~seam~~（裸写的英文，DSH 用语；正文写正式名）

### UL-cordis-service-definition · Cordis 服务定义 · Cordis Service Definition

> **中**：在一个[能力接缝](#ul-capability-seam--能力接缝--capability-seam)里**给出名字与形状**的那个角色：
> 它占定这项能力在 Cordis 上下文里的服务键，并给出调用方要用的样子——一个抽象的 Cordis service，
> 或一个具体的注册表 service，连同它们用到的词汇类型。它本身可以不含任何实现。每个接缝恰有一个。
>
> **EN**: The role in a capability seam that **gives the capability its name and shape**: it claims
> the service key in the Cordis context and states what callers use — an abstract Cordis service or a
> concrete registry service, together with the vocabulary types they use. It need contain no
> implementation. Every seam has exactly one.

- **形态**：属性
- **出处**：[现行词义](../index.md)（产品负责人 2026-10-02 直接裁决）
- **别混 ①**：只有类型、不占服务键的东西（例如一个 TypeScript `interface`）**不是**它——没有服务键，消费者就无从按键取用。
- **别混 ②**：不是那项能力的契约。契约写性质与保证；服务定义只给出 Cordis 上的名字与形状。
- **弃用**：~~Service Definition~~（DSH 原名，不带 Cordis 限定）

### UL-cordis-service-provider · Cordis 服务提供者 · Cordis Service Provider

> **中**：在一个[能力接缝](#ul-capability-seam--能力接缝--capability-seam)里**兑现那项能力**的角色：
> 一个 Cordis 插件在[服务定义](#ul-cordis-service-definition--cordis-服务定义--cordis-service-definition)占定的服务键上提供实现，
> 或向服务定义给出的注册表登记实现。同一个接缝可以有多个；换掉其中一个，服务定义不变，消费者也不变。
>
> **EN**: The role in a capability seam that **fulfils the capability**: a Cordis plugin provides an
> implementation under the service key the service definition claims, or registers one with the
> registry the service definition offers. A seam may have several; replacing one changes neither
> the service definition nor the consumers.

- **形态**：属性
- **出处**：[现行词义](../index.md)（产品负责人 2026-10-02 直接裁决）
- **别混 ①**：不是[允许的供应商](capabilities-and-composition.md#ul-allowed-providers--允许的供应商--allowed-providers)里的「供应商」——
  那是模型请求发往的上游服务商，英文同样是 provider。
- **别混 ②**：不是实现映射里的**提供者节点**（`kind: provider`）——那是一份设计文档的种类；
  它所写的包在装配上通常担任 Cordis 服务提供者，但也可能只担消费者，或不担任何接缝角色。
- **别混 ③**：不是[工作区地址提供者](scope-and-resolution.md#ul-workspace-address-provider--工作区地址提供者--workspace-address-provider)
  或[沙箱实现](grounding-and-isolation.md#ul-sandbox-implementation--沙箱实现--sandbox-implementation)——那两个是产品概念，
  各自说的是提供地址、提供隔离环境；它们在装配上落成哪个接缝的 Cordis 服务提供者，是另一层的事。
- **弃用**：~~服务提供者~~（裸写；产品正文里按这个意思用过，见 [C-50](../conflicts.md#c-50裸写的服务提供者)）

### UL-cordis-service-consumer · Cordis 服务消费者 · Cordis Service Consumer

> **中**：在一个[能力接缝](#ul-capability-seam--能力接缝--capability-seam)里**按服务键取用那项能力**的角色：
> 要么在 Cordis 插件的 `inject` 里把这个键声明为必需，要么在调用时按这个键取用（可选依赖）。
>
> **EN**: The role in a capability seam that **uses the capability through its service key**: either
> declaring the key as required in a Cordis plugin's `inject`, or looking it up by key at call time
> (an optional dependency).

- **形态**：属性
- **出处**：[现行词义](../index.md)（产品负责人 2026-10-02 直接裁决）
- **别混**：直接 import 某个包里的函数来用、不经服务键，**不是**这个角色——那是一条普通的编译期依赖，
  与哪个接缝都无关。
- **弃用**：~~Consumer~~（DSH 原名，不带限定）

### UL-cordis-plugin-tree · Cordis 插件树 · Cordis Plugin Tree

> **中**：**一个进程启动时挂上的全部 Cordis 插件及各自的配置**，由
> [插件树层](#ul-plugin-tree-layer--插件树层--plugin-tree-layer)按固定次序叠出来，后一层按行覆盖或增补前一层。
> 它只随进程而定，**不随组织、租户或会话变**；运行中按会话为某个 agent 装上的 Cordis 插件不在其中。
>
> **EN**: **All the Cordis plugins a process mounts at start, with each one's configuration**, built by
> stacking the plugin tree layers in a fixed order, a later layer overriding or adding to an earlier one
> row by row. It is fixed per process and **does not vary by organization, tenant or session**; Cordis
> plugins mounted for an agent per session at run time are not part of it.

- **形态**：视图
- **出处**：[现行词义](../index.md)（产品负责人 2026-10-02 直接裁决）
- **别混 ①**：不是 [Agent 装配](agent-runtime-loop.md#ul-agent-assembly--agent-装配--agent-assembly)，
  也不是[装配清单](agent-runtime-loop.md#ul-assembly-manifest--装配清单--assembly-manifest)——那两样按会话求值出「agent 是什么样」；
  插件树是进程这一级的，与哪个会话、哪个 agent 都无关。
- **别混 ②**：不是[部署参数](grounding-and-isolation.md#ul-deployment-parameter--部署参数--deployment-parameter)——
  部署参数是产品正文要求按部署配置的那些值；它们可以写进运维者层、当某个插件的配置，但插件树还决定挂哪些插件。
- **别混 ③**：不是[插件](capabilities-and-composition.md#ul-plugin--插件--plugin)（资产）组成的树——这里的插件一律是 Cordis 插件。

### UL-plugin-tree-layer · 插件树层 · Plugin Tree Layer

> **中**：叠成 [Cordis 插件树](#ul-cordis-plugin-tree--cordis-插件树--cordis-plugin-tree)的**一级数据**。本版恰有两格，次序固定：
> **发行层**（随发行物带来，由发行方维护）在前，**运维者层**（由[运维者](subjects-and-ownership.md#ul-deployment-operator--运维者--deployment-operator)为一次部署写）在后。
> 每一格由若干行组成，一行指定一个 Cordis 插件及其配置，或改动前一格已有的某一行。**没有组织、租户或会话这几格。**
>
> **EN**: **One level of data** stacked into the Cordis plugin tree. This version has exactly two, in a
> fixed order: the **distribution layer** (shipped with the release and maintained by the publisher)
> first, then the **operator layer** (written by the deployment operator for one deployment). Each consists
> of rows; a row names a Cordis plugin and its configuration, or amends a row from the earlier layer.
> **There are no organization, tenant or session layers.**

- **形态**：位置
- **出处**：[现行词义](../index.md)（产品负责人 2026-10-02 直接裁决）
- **别混**：不是[作用域层](scope-and-resolution.md#ul-scope-layer--作用域层--scope-layer)——那四层（出厂默认、组织、租户、会话）
  管[范围化对象](scope-and-resolution.md#ul-scoped-object--范围化对象--scoped-object)怎么求值；插件树层不参与求值，上面也不挂范围化对象。
  发行层也不是「出厂默认」那一层。
- **注意**：「本版恰两格」是产品负责人定的；要加一格，回到产品负责人。

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
