# model-contract 源码

本目录拥有实际公开导出与本成员内部代码。根入口导出各章源文件的全部类型声明和 34 个运行值：`identity-values.ts` 的身份解码、比较函数与常量，`credential-values.ts` 的凭据解码与持有者比较，`guard-control.ts` 的守卫派生，`replay-values.ts` 的回放声明展开、校验与回放投影，调用引用编解码与共享输入 judge、`model-stream-values.ts` 的显示投影 diff/apply、`result-delivery-judge.ts` 的交付载荷核对，以及 `MODEL_SEND`。本目录的源码是公开声明的唯一副本，[公开页](../docs/public-api.md)各章只导航到这里；`mint.ts` 是品牌铸造点，不从入口导出，只由解码函数和守卫派生调用。`testing/` 是 `./testing` 入口的源码：受控替代提供者与替代传输，以及把它们接成被测方的 `createScriptedConformanceSubject`，由 `testing/index.ts` 按名导出。`conformance/` 是 `./conformance` 入口的源码：提供者符合性断言（入口 `checkModelProviderConformance`），由 `conformance/index.ts` 按名导出，不导出替身。两个目录都只用本包的公开类型与本包已声明的依赖，不被根入口导入，也不被其余产品源码导入；`conformance/` 只从 `testing/reference-input.ts` 取脚本夹具的引用构造，`testing/conformance-scripted.ts` 取套件的缺省值与辅助函数。

[目录索引](index.md)。

最终 ResultTrim、ResultPart 与 ResultPage.parts 由 call-surface.ts 唯一声明；在途 Snapshot/VisibleBlock 保持原义。testing 的结果页校验及目标组页由 result-pages.ts 拥有，显式 settle 不从 play 推断结果。
