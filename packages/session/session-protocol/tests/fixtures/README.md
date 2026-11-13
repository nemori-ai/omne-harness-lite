# tests/fixtures

本目录承载测试使用的固定输入。

## 允许的内容

测试数据文件与说明。

## 边界

固定输入不能代替规格；数据的来源与生成方式写在本 README。

## 维护

输入格式或来源变化时，同步引用它的测试。

## 本包事实

`browser/` 是手写的浏览器消费者工程，照共同契约成员的浏览器夹具写：`tsconfig.json` 带 DOM、`types` 为空、用 `source` 条件解析包入口；`main.ts` 用 `observe-session` 的帧读写器写一帧再读回。`tests/browser-fixture.spec.ts` 用它核 RFC-0015 I-18。负责人是 session 组。
