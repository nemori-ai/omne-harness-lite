# tests/fixtures

本目录承载测试使用的固定输入。

## 允许的内容

测试数据文件与说明。

## 边界

固定输入不能代替规格；数据的来源与生成方式写在本 README。

## 维护

输入格式或来源变化时，同步引用它的测试。

## 本包事实

本目录放测试辅助代码，不放数据文件。`sqlite-storage.ts` 是 node:sqlite 上的 `SqlStorage` 测试提供者，`faults.ts` 是故障包装，`app.ts` 组装租户目录、登记与两个适配器，`ledger.ts` 在给定记录仓上构造真实账本，`settled-offloaded.ts` 种入原文已卸载的已收场调用，`statement-meter.ts` 统计每条语句，`host-paths.ts` 给历史无关关卡提供每调用的宿主值。数据全部由测试在临时目录中生成，测试结束时删除。
