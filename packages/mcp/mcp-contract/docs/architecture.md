# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：模块划分、依赖方向、状态归属和关键机制。组级约束见[组工程设计](../../docs/architecture.md)。

## 模块与依赖

| 模块                                                     | 内容                                                                 | 依赖                         |
| -------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| `brands.ts`                                              | 品牌类型与唯一授予它们的守卫                                         | 无                           |
| `values.ts`                                              | 组合值：接入点、设置配值、键、对端视图、动作定义                     | `brands`                     |
| `json.ts`                                                | JSON 树的读取工具与规范化，包内使用                                  | `json-text`                  |
| `digest.ts`                                              | `sha256:` 文本摘要，包内使用                                         | `node:crypto`                |
| `endpoint.ts`、`endpoint-schema.ts`                      | 正文解析、本机命令判定、类别端口与 schema 文本                       | `assets`、`json-text`        |
| `listing.ts`                                             | `completeListing`、`digestDefinition` 与完整清单的登记               | `brands`、`json`、`digest`   |
| `catalog.ts`                                             | 清单记录、`mergeListing`、`markUnavailable`、`actionPermissionItems` | `listing`                    |
| `classify.ts`、`content.ts`                              | 结局分类与内容交付                                                   | `content-block`、`json`      |
| `instructions.ts`                                        | `boundInstructions`                                                  | `digest`                     |
| `keys.ts`                                                | 对端账号与两个键                                                     | `legal-identity`             |
| `outcomes.ts`、`ports.ts`、`transport.ts`、`services.ts` | 结局、需求端口、传输端口与服务接口，只有类型                         | 上面的值                     |
| `testing-*.ts`                                           | 符合性套件、内存替身与样本表，只经 `./testing` 导出                  | 公开根的函数与 `node:assert` |

依赖只指向公共值成员与 `assets`。公开根与 `./provider` 不触及 `testing-*` 模块，测试核对这一点。本包不依赖 Cordis、MCP SDK 或任何实现成员。

## 关键机制与理由

- 品牌由类型守卫授予，源码里没有类型断言。守卫是每个品牌唯一的入口，所以调用方和实现方都能构造值，又不能绕过检查。
- 完整清单用三样东西保证只能由 `completeListing` 构造：类型上的品牌、模块私有的 WeakSet、登记并收窄类型的断言函数。展开复制出的对象能通过类型检查，所以必须有运行时登记。代价见 SPEC C4：登记不能跨进程，双份加载互不承认。
- 清单带上取得前读到的修订（`basedOn`），`mergeListing` 只核这一个修订。这样「读取、取页、合并、写入」之间插入的较新采用一定被发现。
- 传输交出原样应答，分类集中在 `classifyOutcome`。输出校验函数由调用方注入，本包不带 JSON Schema 校验库。
- 凭据句柄按用途分型并以 `purpose` 区分。进程句柄对 MCP 不透明，它怎样注入变量是两个外部实现方之间的约定。
- `actionDefinitionOf` 保留为一个函数：它同时核对 MCP 读的四个字段，拆开会让「每项合法」分散到几处。

## 验证与维护

每条 SPEC 条款对应的测试见 SPEC「组合与验证」。封闭集合有代码列表 `tests/closed-sets.ts`，类型测试把它钉在类型上，另一条测试核对 SPEC 写到每一项。改公开类型时同步 `@omne-harness/mcp`、`@omne-harness/mcp-host-local` 与组设计；改 schema 时同步 `src/endpoint-schema.ts`。
