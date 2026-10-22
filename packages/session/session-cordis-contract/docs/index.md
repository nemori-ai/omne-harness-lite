# docs 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [cordis.md](cordis.md)：服务定义、端口服务键、事件、依赖分类与 IC 符合性
- [architecture.md](architecture.md)：入口、依赖、关键选择与理由
- [context.md](context.md)：谁安装本成员、使用与定位
- [flows.md](flows.md)：不适用的理由与流程的拥有者
- [object-model.md](object-model.md)：不适用的理由与领域对象的拥有者
- [public-api.md](public-api.md)：导出入口与定义索引

## 阅读路径

- 声明调用方类或取得服务：[cordis.md](cordis.md)，再读 [context.md](context.md)。
- 实现提供者：[../SPEC.md](../SPEC.md)，再读 [cordis.md](cordis.md)。
- 修改本成员：[architecture.md](architecture.md)、[public-api.md](public-api.md)，再读 SPEC 的[实现与验证](../SPEC.md#实现与验证)。
