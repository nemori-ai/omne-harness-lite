# model-contract 源码

PACKAGE_TEMPLATE_DRAFT

本目录拥有实际公开导出与本成员内部代码。根入口导出已落地的类型声明和 18 个运行值：`identity-values.ts` 的身份解码、比较函数与常量，`credential-values.ts` 的凭据解码与持有者比较，`guard-control.ts` 的守卫派生，以及 `MODEL_SEND`。设计声明归 docs/public-api.md，每章一个源文件；`mint.ts` 是品牌铸造点，不从入口导出，只由解码函数和守卫派生调用。

[目录索引](index.md)。
