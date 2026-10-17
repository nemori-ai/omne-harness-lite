# Model 源码

PACKAGE_TEMPLATE_DRAFT

本目录拥有公开类型、运行时校验和内部实现。[index.ts](index.ts) 已导出凭据引用、解析与本地保管能力，托管运行接口尚未实现。后续实现须依据 [SPEC](../../model-contract/SPEC.md) 的已接受范围，不能仅凭设计声明声称接口已实现。

[cordis.ts](cordis.ts) 和 [execute.ts](execute.ts) 拥有凭据切片的框架入口。其他 Model 服务的定义仍归 model-cordis-contract。文档导航见 [index](index.md)。
