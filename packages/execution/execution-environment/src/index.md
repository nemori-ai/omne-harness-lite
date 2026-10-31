# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，重导出工厂、错误类与三个类型
- [registry.ts](registry.ts)：登记表：四张表、落点解析、获取、配额预查、采用与采用失败、查询、退役、恢复授权核对、关闭
- [access.ts](access.ts)：访问核验：环境授权，再核目标作用域绑定到访问租户
- [original.ts](original.ts)：原记录：按配额域选路由，查询与结清，非法答复按未知
- [lease-view.ts](lease-view.ts)：租约视图：逐操作门、失效、释放与重试
- [recovery.ts](recovery.ts)：恢复编排：资源路径逐提供者枚举与停止，获取路径每个配额域列出一次并逐项结清
- [compare.ts](compare.ts)：输入复制、原获取描述的指纹，以及绑定层、作用域与键集合的比较

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与依据，再读[内部架构](../docs/architecture.md#模块与依赖)，最后读源码。
