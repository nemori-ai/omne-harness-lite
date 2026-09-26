# offer-expiry

公开入口和采用边界见[实现节点](../../../.meta_harness/design/realization/packages/core/offer-expiry/README.md)。

默认 `./schema` 随当前治理提供者采用 OE2。`./schema/v1` 原样发布冻结 OE1，供仍精确钉 OE1 `Instant` 的资产与 Agent 数据契约构建资源图；此子入口不承诺两版全部业务或根函数兼容。

在本包运行 `pnpm run build`、`pnpm run typecheck`、`pnpm run test`；跨包只使用公开 exports。
