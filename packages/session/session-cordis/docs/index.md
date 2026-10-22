# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [cordis.md](cordis.md)：插件与服务、注入配置与生命周期、调用方类核对、提交通知、扫描者绑定、撤除顺序、IC 符合性映射、验证义务
- [architecture.md](architecture.md)：模块与依赖、关键机制与理由、SOLID 与扩展边界
- [flows.md](flows.md)：FC-01 至 FC-04 生命周期流程，失败与生命周期
- [object-model.md](object-model.md)：服务实例、插件配置、端口接线、组合通知者与租户维护表
- [public-api.md](public-api.md)：导出入口与定义索引
- [context.md](context.md)：装配、独立使用与定位

## 阅读路径

- 装配本插件：[context.md](context.md)，再读 [cordis.md](cordis.md#配置)与 [cordis.md 的扫描者绑定](cordis.md#扫描者绑定)。
- 实现本插件：[../SPEC.md](../SPEC.md)、[cordis.md](cordis.md)，再读 [flows.md](flows.md)、服务定义成员的 [Cordis 说明](../../session-cordis-contract/docs/cordis.md)与 session 的[公开入口](../../session/docs/public-api.md)。
- 修改本成员：[architecture.md](architecture.md)、[public-api.md](public-api.md)，再读 SPEC 的[验证](../SPEC.md#验证)。
