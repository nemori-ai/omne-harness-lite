# Model 源码

PACKAGE_TEMPLATE_DRAFT

本目录拥有公开类型、运行时校验和内部实现。[index.ts](index.ts) 已导出凭据发送接缝与存在性、解析的判定，托管运行接口尚未实现。后续实现须依据 [SPEC](../../model-contract/SPEC.md) 的已接受范围，不能仅凭设计声明声称接口已实现。

本地保管库、Cordis 插件与注入发送已迁入 [model-host-local](../../model-host-local/src/index.md)。[cordis.ts](cordis.ts) 和 [execute.ts](execute.ts) 现在是空模块，只因包清单还声明它们而保留。其他 Model 服务的定义归 model-cordis-contract。文档导航见 [index](index.md)。
