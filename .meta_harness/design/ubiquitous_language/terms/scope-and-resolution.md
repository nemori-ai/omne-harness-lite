# 作用域与求值

**这一卷回答：一个值是怎么被算出来的。**

收在这里的都是**求值机制**——归属的层级、判定同一性的标识、几层同时有值时怎么合成，
以及 agent 感知到的「我现在处在什么情形下」。**被求值的那些东西**归
[能力与构成](capabilities-and-composition.md)，**求值的结果落到谁头上**归
[主体与归属](subjects-and-ownership.md)。

词条格式与准入判据见 [conventions](../conventions.md)。

## 层与对象

### UL-scope-layer · 作用域层 · Scope Layer

> **中**：[协作范围 context](#ul-collaboration-scope-context--协作范围-context--collaboration-scope-context) 内部
> **归属范围的层级**。共四层，由低到高：
>
> | 中文 | English | 归属 |
> |---|---|---|
> | **出厂默认** | **Factory Default** | 系统 |
> | **组织级** | **Organization** | 组织 |
> | **租户级** | **Tenant** | (组织, 账号) |
> | **会话级** | **Session** | 本次协作 |
>
> **它说的是「归属」，不是「有一堆自己的字段」**：一层的设置与权限，是它持有的资产
> 各自属性的[投影](#ul-attribute-projection--属性投影--attribute-projection)。
>
> **EN**: The levels of **ownership** inside the collaboration-scope context, four in
> all, from lowest to highest: **Factory Default**, **Organization**, **Tenant** and
> **Session**. A layer denotes **ownership, not a set of fields of its own** — its
> settings and permissions are projections of the attributes of the assets it holds.

- **出处**：[PF-001 §6.1 层次](../../product/PF-001-identity-scope-and-agent-constraints/design.md#61-层次)（rev 6）
- **别混 ①**：**账号不在这四层里**——它的[求值是恒等的](#ul-scope-evaluation--作用域求值--scope-evaluation)，不占一格
- **别混 ②**：[上级组织](subjects-and-ownership.md#ul-parent-organization--上级组织--parent-organization)**不进这四层**——否则层数会随隶属链变化，且把「隶属」悄悄变成「被管辖」
- **别混 ③**：**裸写「层」不作数。**系统里到处是层
- **弃用**：~~「账号层」~~

### UL-scoped-object · 范围化对象 · Scoped Object

> **中**：**协作范围 context 内部**的对象——设置、权限与资产的共同抽象：
> **归属于某一作用域层、并参与求值的对象**。每个这样的对象都带三个要素：
> [能力标识](#ul-capability-identifier--能力标识--capability-identifier)、所属层、
> [合成语义](#ul-scope-composition-semantics--作用域合成语义--scope-composition-semantics)。
>
> **EN**: The common abstraction over settings, permissions and assets **inside the
> collaboration-scope context**: an object that **belongs to one scope layer and
> takes part in evaluation**. Each carries three elements — a capability identifier,
> an owning layer, and composition semantics.

- **出处**：[PF-001 §4 范围化对象](../../product/PF-001-identity-scope-and-agent-constraints/design.md#范围化对象)（rev 6）
- **别混**：[个人 context](#ul-personal-context--个人-context--personal-context) **不是**范围化对象——它在另一个轴上。账号的身份事实（登录标识、凭据、激活状态）**也不是**

### UL-capability-identifier · 能力标识 · Capability Identifier

> **中**：判定两个[范围化对象](#ul-scoped-object--范围化对象--scoped-object)是否
> **「实质上同一性质」**的标识，从而决定它们**能否互相覆盖**。
> 资产声明的依赖与引用**指向能力标识，不指向某个具体资产**——
> 所以发生覆盖之后，**依赖自动指向当前生效的那一个**。
>
> **EN**: The identifier deciding whether two scoped objects are **"the same thing in
> substance"**, and therefore whether one **may override** the other. An asset's
> declared dependencies and references **point at capability identifiers, never at a
> specific asset** — so after an override, **a dependency resolves automatically to
> whichever asset is now in effect**.

- **出处**：[PF-001 §4 范围化对象](../../product/PF-001-identity-scope-and-agent-constraints/design.md#范围化对象) · [§6.3](../../product/PF-001-identity-scope-and-agent-constraints/design.md#63-依赖与组合)（rev 6）

## 怎么算

### UL-scope-evaluation · 作用域求值 · Scope Evaluation

> **中**：沿[作用域层](#ul-scope-layer--作用域层--scope-layer)把各层持有的
> [范围化对象](#ul-scoped-object--范围化对象--scoped-object)算成**这次实际生效的那一份**。
> 账号也求值，只是它的求值**恒等**——给一个账号，求出这一个自然人，**不需要任何机制**。
>
> **EN**: Computing **what actually takes effect this time** from the scoped objects
> held at each layer. An account is evaluated too, but its evaluation is **the
> identity function** — given an account, it yields that one natural person,
> **requiring no mechanism at all**.

- **出处**：[PF-001 §4 账号](../../product/PF-001-identity-scope-and-agent-constraints/design.md#账号) · [§6.2](../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 6）
- **注意**：**求值与[装配](agent-runtime-loop.md#ul-agent-assembly--agent-装配--agent-assembly)不能合并**——合并的话，「组织禁用了某个 skill」与「这个 agent 没引用它」会变成同一件事，而两者的产品含义完全不同

### UL-scope-composition-semantics · 作用域合成语义 · Scope Composition Semantics

> **中**：同一[能力标识](#ul-capability-identifier--能力标识--capability-identifier)的对象
> 在多层同时存在时，**怎样合成出最终结果**。三种，各对一类对象：
>
> | 对象 | 中文 | English | 怎么合成 | 层次有方向吗 |
> |---|---|---|---|---|
> | 设置 | **覆盖** | **Override** | 取最高层有值的那个，低层被丢弃 | 有 |
> | 权限 | **收窄** | **Narrowing** | 取各层的**交集**；高层是不可突破的边界 | **无**（交集可交换） |
> | 资产 | **组合 + 同标识覆盖** | **Composition + Same-Identifier Override** | 不同标识并存，同标识取最高层 | 同标识时有 |
>
> **EN**: How objects sharing one capability identifier across several layers combine
> into a final result. Three kinds: **Override** for settings (the highest layer with
> a value wins), **Narrowing** for permissions (the intersection across layers;
> order-independent), and **Composition + Same-Identifier Override** for assets.

- **出处**：[PF-001 §6.2 三种合成语义](../../product/PF-001-identity-scope-and-agent-constraints/design.md#62-三种合成语义)（rev 6）
- **别混**：**裸写「组合 / composition」不作数**——[资产组合](capabilities-and-composition.md#ul-asset-composition--资产组合--asset-composition)是另一回事
- **注意**：**「选择」就是「收窄到只剩一个」**。组织收窄为空集，租户再怎么设也拿不到——**空集与谁的交集都是空集**
- **注意**：资产求值有一条**下界**：每个 [official](circulation-and-entitlement.md#ul-official-asset--官方件--official-asset) 能力标识下都必须有东西，**任何层都不能把它清空**

### UL-two-pass-resolution · 两轮求值 · Two-Pass Resolution

> **中**：求值分两轮，**作用对象不同**：第一轮作用在**资产**上（这个能力标识下生效的是哪个资产），
> 第二轮作用在**资产的属性项**上（这个资产的某项设置或权限取什么值）。
>
> **EN**: Evaluation runs in two passes over **different objects**: the first over
> **assets** (which asset is in effect under this capability identifier), the second
> over **an asset's attribute entries** (what value a given setting or permission
> takes).

- **出处**：[PF-001 §6.2 两轮合成](../../product/PF-001-identity-scope-and-agent-constraints/design.md#两轮合成作用对象不同) · [PF-002 §5.6](../../product/PF-002-assets-settings-and-permissions/design.md#56-四步资产求值--组装--投影--层级计算)（rev 6 / rev 2）
- **别混**：混为一谈就会得出「**改一项设置等于换一个资产**」这种结论——而实际上租户改默认模型时，用的还是**组织共享的那一个**资产

### UL-immutable-marker · 不可覆盖标记 · Immutable Marker

> **中**：一层给出某个值时可以附加的标记，表示这个值**不可再被上层覆盖**。
> 不加即「**默认**这样」，加了即「**必须**这样」。**一个标记同时管三处**：
> 设置的字段值、权限的取值、资产的替换。
>
> **EN**: A marker a layer may attach to a value it supplies, meaning the value
> **cannot be overridden by any higher layer**. Without it the layer says
> "**by default** this"; with it, "**it must be** this". **One marker covers three
> cases**: a setting's field value, a permission's value, and an asset substitution.

- **出处**：[PF-001 §6.2 默认与强制](../../product/PF-001-identity-scope-and-agent-constraints/design.md#默认与强制immutable) · [PF-002 §5.4](../../product/PF-002-assets-settings-and-permissions/design.md#54-默认与强制一个机制三处适用)（rev 6 / rev 2）
- **注意**：对权限而言，`immutable(v)` 就是把允许集合**收窄到单元素** `{v}`——**强制是收窄的特例**

### UL-attribute-projection · 属性投影 · Attribute Projection

> **中**：某一层的设置或权限，是**它持有的资产各自属性**在这一层上的投影——
> **是视图，不是对象**，不需要维护，**是持有关系的函数**。
> 真正可被读写的最小单位是 **（身份层，具体资产，属性项）→ 值**。
>
> **EN**: A layer's settings or permissions are a **projection** of the attributes of
> the assets it holds. It is a **view, not an object**: nothing to maintain, being a
> **function of the holding relation**. The smallest read-write unit is
> **(identity layer, specific asset, attribute entry) → value**.

- **出处**：[PF-001 §4 设置、权限、资产](../../product/PF-001-identity-scope-and-agent-constraints/design.md#设置权限资产) · [PF-002 §5.2](../../product/PF-002-assets-settings-and-permissions/design.md#组织的设置是视图不是对象)（rev 6 / rev 2）
- **注意**：**没有「组织的设置」这个对象。**把它当对象实现，就会出现一份**独立于资产的字段表**，两者各自演化，最终对不上

## agent 感知到的处境

### UL-runtime-context · 运行时 context · Runtime Context

> **中**：**agent 在运行时能感知到的、关于「我现在处在什么情形下」的信息。**
> 三类**同归一处、同样通过[注入](agent-runtime-loop.md#ul-runtime-injection--运行时注入--runtime-injection)到达**：
> [协作范围 context](#ul-collaboration-scope-context--协作范围-context--collaboration-scope-context)、
> [个人 context](#ul-personal-context--个人-context--personal-context)，
> 以及**运行期才产生的那些**（外部环境变了、权限被调整了、某个依赖不可用了）。
>
> **EN**: Information available to an agent at run time about **the circumstances it
> is currently operating in**. Three kinds, **kept together and all arriving by
> injection**: collaboration-scope context, personal context, and **whatever arises
> only at run time** — a changed external environment, an adjusted permission, a
> dependency gone unavailable.

- **出处**：[PF-001 §4 Context](../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息) · [PF-004 §4 运行期上下文](../../product/PF-004-agent-definition-and-assembly/design.md#运行期上下文)（rev 6 / rev 3）
- **别混 ①**：**不是 Cordis 的 `Context`**——那是依赖注入与生命周期的容器，属技术设计。指它时**必须写全 `Cordis Context`**
- **别混 ②**：**不是[给模型看的上下文](../index.md#记录与上下文)**。**裸写「上下文 / context」在跨 topic 的文字里一律不作数**，[已记为冲突](../conflicts.md#现有冲突)

### UL-collaboration-scope-context · 协作范围 context · Collaboration-Scope Context

> **中**：「**我现在在哪个组织、以什么租户身份、什么角色**」。由组织与租户承载。
> 它一换，**能用的资产、能做的事、怎么做全都变**。
> 四个[作用域层](#ul-scope-layer--作用域层--scope-layer)是**它内部**的层次。
>
> **EN**: **Which organization I am in, under which tenant identity, in which role.**
> Carried by the organization and the tenant. When it changes, **the assets
> available, the actions allowed and the way they are performed all change.** The
> four scope layers are the layers **inside it**.

- **出处**：[PF-001 §4 Context](../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 6）

### UL-personal-context · 个人 context · Personal Context

> **中**：**属于这个人本身的偏好**——界面语言、时区、通知方式一类。由账号承载，
> **跟着人走，在所有组织里都一样**。它**不是范围化对象**，**不参与任何层的合成**。
>
> **EN**: **Preferences belonging to the person themself** — interface language, time
> zone, notification channel and the like. Carried by the account, it **follows the
> person and is identical across all organizations**. It is **not a scoped object**
> and **takes part in no layer composition**.

- **出处**：[PF-001 §4 Context](../../product/PF-001-identity-scope-and-agent-constraints/design.md#contextagent-运行时可感知的上下文信息)（rev 6）
- **注意**：「**正交**」的意思是两者**独立变化**——切换组织不改界面语言，改界面语言也不影响自己在哪个组织。因此**不能用同一套层次去合成**

返回[统一语言入口](../README.md) · [全部词条索引](../index.md)
