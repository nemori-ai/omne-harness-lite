# resources 索引

职责、读取方式、许可与发行前提见 [README.md](README.md)。

## 内容

- 根入口的 shippedCalendarSeedRelease 定位发行 pack/release 与摘要，createShippedCalendarSeedRegistry 读取并核验原始字节。
- 包内 `data/seeds/` 保存发行 pack、inputs、raw 与 evidence，具体路径以发行输入为准。
- 包内 `data/cn-in-lieu/` 保存 CN 补充数据、provenance 与 MIT 许可，只用于既有 inLieu 校验。
- [公开入口](../docs/public-api.md)、[初始化流程](../../docs/key-flows.md#f-ca03-离线种子初始化或升级)说明显式导入和就绪前提。
