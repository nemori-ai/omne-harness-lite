# @omne-harness/sql-contract 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。没有非类型行为时，写明理由。

## 范围与依据

依据：SQL r2 规格第 2 至 4 节与公开形状（SHA256 `32f2e168d54854956ab223146d73959de124bc24732d770a41607c08691101f8` 与 `f9dee7d6a175b7938e9afcae12a7a55551078d55a2ccb2e8c679e5152acb7d01`），采用记录为 #687 评论 6554935672。本文件只写本包已实现的部分：身份与字段规则、协议 2 输入摘要、材料与组合有效性、清单摘要，以及内存替身与符合性套件的范围。提供者行为（事务域、提交、读池、关闭）在 #687 第二段写入提供者规格。采用是设计采用，不是交付接受。

## 结果与不变量

- **字段规则**：名字类字段（`tenant`、`operation`、`operationKey`、`combinationVersion`、`participant`、`handler`、`protocol`、`requestKey`）非空、合法 UTF-16、UTF-8 不超过 1024 字节。`transactionDomain` 不超过 120 字节。摘要类字段是 64 位小写十六进制。违反时 `commit` 与 `registerCombination` 返回 `field_missing`，`query` 返回 `unknown`，`read` 返回 `invalid`。
- **身份**：五个维度（作用域、事务域、操作、协议版本、操作键）全部相等才算同一身份。系统作用域只写作 `{ kind: 'system' }`，空租户不是系统作用域。协议版本只有 `'2'`。
- **输入摘要**：`inputDigestV2` 对作用域、组合版本、清单摘要与按 `participant` 的 UTF-16 码元升序排列的命令，取 RFC 8785 规范文本的 UTF-8 SHA-256，写成小写十六进制。命令顺序与对象键顺序不改变摘要。`facts` 含非严格 JSON 的值时抛 `TypeError`，不对有损形式取摘要。
- **组合有效性**：`combinationManifest` 先判参加者缺失（`material_unavailable`，只报第一个缺失者），再一次收集全部问题（`combination_invalid`）：事实依赖成环、缺事实提供者、事实有两个提供者、一张表有两个拥有者、读取的表没有拥有者、迁移 `requires` 缺项、迁移成环。
- **清单摘要**：清单去掉 `moduleUrl`，数组与条目按 UTF-16 码元升序，用 RFC 8785 写出后取 SHA-256。测试向量摘要为 `b8cb9846fa33866cea139ff67980096603ec26d41473dbed29e1a5784329e1dd`。读 handler 不进入清单。
- **替身的拒绝顺序**：`commit` 先按规格第 7.2 节第 1 至 7 步在控制侧判断（`closing`、`cancelled`、`field_missing`、`unsupported_protocol`、`participant_repeated`、`facts_not_json`、`command_limit`），再判第 11 至 15 步；多个条件同时成立时返回第一个。
- **禁止**：服务键 `sqlStorage`、定义名 `SqlStorageService` 与任何别名；`StorageControl` 作为服务属性或进入 `Context`；根与 `./worker` 导入 Cordis。

## 所有权、失败与生命周期

纯函数无状态、无资源。内存替身把全部状态放在一个实例内，操作按到达顺序串行；它的持久性是 `none`，进程结束即丢失。替身只建模 absent、ready 与 closed 三个域状态：另一作用域的请求得到与 absent 相同的结果（含诊断），唯一例外是登记时的 `domain_occupied`。替身中取消只结束观察：调用之后中止，调用方得到 `unknown`（`observer_detached`），操作照常完成，可用原身份 `query` 认回。关闭后新操作得到 `closing`，未开始的操作得到 `unknown`（`withdrawn_before_start`），在途操作完成。替身不产生外部效果。

## 组合与验证

验证资源在 `tests/`：每条字段规则、每个拒绝原因各一条只违反它的用例，相邻两步的顺序用例，摘要向量与 RFC 8785 数字用例，`combinationManifest` 每类问题的用例，入口与不含 Cordis 的依赖检查，以及符合性套件对替身和故意违规提供者的用例。未覆盖：规格第 5 至 13 节在 SQLite 上的行为，以及场景 C08 至 C11、C13、C15、C17 至 C23。
