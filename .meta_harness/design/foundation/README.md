# 项目基础前提

这里保存产品设计之前就已成立的东西：项目目标、跨系统约束、继承义务。
它们不是某一块产品的设计，而是**所有产品设计共同的前提**。

失效事件：项目层面的方向调整。单个产品 topic 的变化不影响这里。

**这里有一个根目标。**[SYS-DYNAMIC 完全动态系统](fully-dynamic-system/README.md)
是其余各条服务的对象——谈解耦、谈组合、谈恢复接续，归根结底都是在谈
**怎样设计和组织这个系统，才能达到完全动态**。引用某一条时，
回到这个根目标问一句「它为什么存在」，通常比逐字抠条款更快找到分界。

## 内容

| Topic | 承载什么 |
|---|---|
| [cross-system-constraints](cross-system-constraints/README.md) | SYS-IDENTITY、SYS-KERNEL、SYS-SPEC、SYS-DEPLOY、SYS-TENANT、SYS-LLM、SYS-EXPERIMENT 七条跨系统约束 |
| [definition-and-runtime-composition](definition-and-runtime-composition/README.md) | SYS-COMPOSITION：定义、装配与活体三段结构，以及内核实际给什么 |
| [fully-dynamic-system](fully-dynamic-system/README.md) | 完全动态系统的目标与判据 |
| [interest-alignment](interest-alignment/README.md) | 与所服务的组织或个人保持利益对齐 |
| [long-running-and-evolving](long-running-and-evolving/README.md) | 超长期待机、稳定运行、持续进化 |
| [observability-and-logging](observability-and-logging/README.md) | 全局可观测性要求 |
| [omne-next-continuity](omne-next-continuity/README.md) | 对 omne-next 的功能继承义务 |
| [runtime-state-and-continuity](runtime-state-and-continuity/README.md) | 运行状态与恢复接续 |

## 它与产品设计的分工

产品设计回答「这块产品是什么」，基础前提回答「任何产品设计都必须满足什么」。

具体分界：**如果一条内容会因为某块产品的方向变化而改变，它属于产品设计；
如果它对所有产品都成立、且改变它意味着项目层面的转向，它属于这里。**

例：「租户隔离，跨租户访问默认拒绝」属于这里——它约束一切产品设计；
「组织由账号创建，创建者自动成为超级管理员」属于产品设计——它是这一块的设计判断。

## 这里的 topic 长什么样

每个 topic 是 `requirements.md` 加 `changes.md`：前者是约束正文，后者记录
每条约束的确认来源与变更。

**它与[产品设计的格式](../product/.templates/topic/README.md)不同，这是有意的。**
基础前提陈述约束，不定义产品——「非目标」「用户与场景」「取舍」这些小节
对它并不适用。不为整齐而套用另一套形状。

返回[设计链入口](../README.md)。
