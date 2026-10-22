# src

本目录承载本包的公开定义、校验与实现。

## 允许的内容

TypeScript 源码。公开入口是 `index.ts`。

## 边界

公开形状只经 `index.ts` 导出。非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。源码不读环境、文件或网络；唯一的资源导入是 js-tiktoken 的 o200k 秩数据。

## 维护

公开导出变化时，同步 [docs/public-api.md](../docs/public-api.md) 与 `tests/public-entry.spec.ts`。记录变化须新增修订，见 [SPEC“记录”](../SPEC.md#记录)。

## 本包事实

模块划分与依赖方向见 [docs/architecture.md](../docs/architecture.md#模块与依赖)。`records.ts` 是纯数据，只导入类型；规则与计量是纯计算。
