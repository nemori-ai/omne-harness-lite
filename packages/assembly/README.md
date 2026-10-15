# 装配交接能力组

本组说明定义求值、采用、绑定及换代交接的工程关系。依据为[领域责任](../../docs/domains/assembly-and-handoff/README.md)和[系统结构](../../docs/architecture/structure.md)。[assembly](assembly/README.md) 的关闭协议已经实现。采用与重装的行为规格已经技术接受，生产实现尚未存在。[kernel-basis](kernel-basis/README.md) 仍是 workspace 草稿，公开行为尚未实现。旧实现仍在 `packages.0.0.1.legacy/core/kernel-basis`，该目录不在 workspace 里。没有整组运行支持。

## 责任与范围

本组承接合法来源、定义、实现、设置、权限及运行条件形成可采用执行配置的关系。来源与业务规则归原治理拥有者，推进资格归原工作，调用事实与结果归实际执行者和消费者。组页不集中维护所有能力的 Service 定义或应用装配入口。

## 成员与依赖

[assembly 文档目标](assembly/README.md)预留求值、采用、绑定与交接的契约位置。它应消费治理规则、工作条件及能力公开契约；能力不反向依赖本组。服务定义随各能力契约维护，发行及运维装配归应用。成员边界和公开入口须在具名消费者及契约明确后确认。

## 关键协作

采用协调者核对同次使用的定义、参数与资格。绑定集成者连接独立能力与提供者。结构变化时，换代协调者与原工作拥有者分别处理新动作资格和旧推进责任。已发调用仍由原执行者和消费者接续。要查一组租约的关闭结果时，读[成员契约](assembly/SPEC.md)。其中该范围已由 [部分接受记录](https://github.com/nemori-ai/omne-harness-lite/issues/222#issuecomment-6162745308) 接受。本页不写那些结果。求值快照、绑定生效、缺依赖失败和旧新推进权的现行行为在[采用与重装](assembly/SPEC.md#adoption)，已由 [技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/264#issuecomment-6186685166) 接受。这些行为尚未有生产实现。

## 组合验证

实际协调者结合原工作、依赖提供者及应用装配验证就绪、撤除、旧新推进权和在途结果。验证须包含缺少必需依赖、结构变化及接续失败。依据见[领域组合验证](../../docs/domains/verification.md)与[采用和换代](../../docs/architecture/runtime/assembly-and-change.md)。关闭协议已有成员测试。组级组合验证仍没有执行资源或通过证据。

## 维护

组技术拥有者维护工程关系，成员契约拥有者维护行为，文档维护者核对导航与来源。长期个人负责人尚未具名。新提供者先确认原能力契约与消费者；跨能力变化同步协调者、参与成员和组合验证。建包按[成员文档规范](../../docs/member-documentation.md)与[开发指南](../../docs/development.md#创建和整改产品包)准入。
