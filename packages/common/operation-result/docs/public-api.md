# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

`package.json` 的 `exports` 只有一个入口 `.`。`source` 条件指向 [src/index.ts](../src/index.ts)，发布的 `types` 与 `import` 指向 `dist/index.d.ts` 与 `dist/index.js`。本包没有 `./cordis` 入口，也没有其他子路径。调用者不需要资格：任何需要操作结果形状的能力契约或实现都按包名 `@omne-harness/operation-result` 导入。

运行时导出恰为四个函数 `ack`、`fail`、`isSuccess`、`succeed`，由 [tests/public-entry.spec.ts](../tests/public-entry.spec.ts) 检查。另有两个只在类型层存在的导出 `Outcome` 与 `Ack`。

## 定义索引

六个导出都在 [src/index.ts](../src/index.ts)。

| 导出 | 种类 | 定义位置 | 行为条款 |
| --- | --- | --- | --- |
| `Outcome<T, F>` | 类型 | [src/index.ts](../src/index.ts) 的类型定义 | [SPEC 操作结果](../SPEC.md#操作结果) |
| `Ack<F>` | 类型 | [src/index.ts](../src/index.ts) 的类型定义 | [SPEC 操作结果](../SPEC.md#操作结果) |
| `succeed(value)` | 函数 | [src/index.ts](../src/index.ts) 的函数定义 | 返回 `{ ok: value }`，见 [SPEC 操作结果](../SPEC.md#操作结果) |
| `ack()` | 函数 | [src/index.ts](../src/index.ts) 的函数定义 | 返回 `{ ok: true }`，见 [SPEC 操作结果](../SPEC.md#操作结果) |
| `fail(failure)` | 函数 | [src/index.ts](../src/index.ts) 的函数定义 | 返回 `{ failure }`，见 [SPEC 操作结果](../SPEC.md#操作结果) |
| `isSuccess(result)` | 类型守卫 | [src/index.ts](../src/index.ts) 的类型守卫定义 | 结果对象带有 `ok` 时为真，见 [SPEC 操作结果](../SPEC.md#操作结果) |

失败行为：本包没有抛出异常的公开路径，失败是 `fail` 返回的值。失败词汇 `F` 不在本包，见 [object-model.md](object-model.md)。
