# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

本包只有一个模块 [src/index.ts](../src/index.ts)。它导出三个类型别名，没有运行时值、状态、资源或配置，也不导入任何模块。

成员位置：`packages/common/exchange-refs`，属于 `common` 组。该组放至少有两个具名消费者、且原语义拥有者确认含义一致的纯表示，见[组说明](../../README.md)。本成员登记在 model 交付线的 `contracts` 下，与 message、content-block、modality、stream-arrival 相同。

依赖方向：本包是叶子，`dependencies` 为空。契约成员可以依赖本包，反方向不允许。Model 与 Tool 是平级成员，互不依赖，所以共同定义必须放在比两者都低的位置，不能以其中一个为唯一源。

## 关键机制与理由

选 `common` 新成员，不选 `legal-identity`。`legal-identity` 的值靠进程内注册表铸造，经 JSON 往返不保留身份。本包的三个值是只有字符串成员的普通记录，经 JSON 往返结构不变。放在一起会让读者以为这三个值也要铸造或重新解析。代价是多一个成员和几条契约到 `common` 的依赖。

不选保留各域副本。各份副本独立修改就会漂移，等价测试只在两边同时修改时才报警。

只发布类型，不发布谓词。各域判定的交集只到「成员是字符串、字段不封闭、允许空串」这一级，比任何一个域实际需要的都弱。发布这个强度的谓词会让调用方误以为值已经核验。摘要算法与跨值规则也不进本包，见 [SPEC.md](../SPEC.md#ownership)。

重新判断的条件：某个值需要带 `TenantId` 时，改放 `legal-identity`。同义的值不足两个时，退回各域副本。各域需求开始分叉并且值频繁变化时，回报共同形状的拥有者。

## 验证与维护

形状由 [tests/shapes.spec-d.ts](../tests/shapes.spec-d.ts) 检查。根入口没有运行时导出、`dependencies` 为空、只有 `.` 入口由 [tests/public-entry.spec.ts](../tests/public-entry.spec.ts) 检查。

改变形状或含义时，先改 SPEC.md，再同步 [SPEC.md 组合与验证节](../SPEC.md#composition)列出的再导出成员，并重新生成它们的 API 快照。
