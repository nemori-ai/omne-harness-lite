# src

本目录承载本包的公开定义、运行时校验与内部实现。`index.ts` 与 `cordis.ts` 是代码入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明：根入口对应 `index.ts`，`./cordis` 对应 `cordis.ts`。

## 边界

源码只用可擦除的 TypeScript 语法。`index.ts` 与根入口可达的全部模块（`host-files.ts`、`host-paths.ts`、`host-file-tree.ts`、`host-file-batch.ts`、`host-command.ts`、`command-gate.ts`、`host-scope.ts`、`host-probe.ts`、`host-domain.ts`、`host-provider.ts`）不导入 `@deepseek-ai/cordis`，也不导入 `./cordis`（[IC-4](../../../../docs/architecture/cordis-integration-conventions.md#ic-4)）。Cordis 绑定只从 `cordis.ts` 导出。非类型行为写在包根 [SPEC.md](../SPEC.md)，不写在源码注释里代替规格。

## 维护

新增或改名公开导出时，同步 `package.json` 的 `exports`、[公开接口页](../docs/public-api.md)、本目录 `index.md` 与入口测试。根入口新增模块时，同步 [public-entry.spec.ts](../tests/public-entry.spec.ts) 的文件清单。改宿主文件使用的已接受行为，先经原接受入口。

## 本包事实

- `host-files.ts`：宿主文件设施 `createHostFiles` 与 `hostObjectToken`；共用文件引擎 `createHostFilesEngine`（选项 `root`、`stateDirectory`、`diagnose`，第二个参数是列表与搜索的上界），它给每个句柄与关闭失败的描述符记所有者，句柄代际在引擎内唯一，`seal(所有者)` 封闭一个所有者；另有一个标为 `@internal` 的测试辅助函数。根入口不导出引擎与测试辅助函数。
- `host-paths.ts`、`host-file-tree.ts`、`host-file-batch.ts`：路径检查与宿主文件根的绑定、前提 P2 的探测；列表、搜索、建目录、删除、移动与复制；提交批次与恢复批次。它们只经 `host-files.ts` 使用，根入口不导出。
- `host-command.ts`、`command-gate.ts`、`host-scope.ts`、`host-probe.ts`：Linux 上的命令设施与它的输出缓冲、门进程脚本、systemd scope 的启动、停止与列举、前提 P1、P3～P6 的探测。
- `host-domain.ts`：宿主文件责任域 `createHostFilesDomain`：获取记录、按文件配置共用的文件引擎、每份获取的门面（准入与在途操作，封闭时同一步封住引擎里的所有者）、配额核对与排空；它的内部面只供本包的提供者使用。
- `host-provider.ts`：宿主文件提供者 `createHostFilesProvider`、它的选项与诊断类型，以及配额、原获取查询、获取枚举、结清、前提的合并与 scope 单元的资源恢复。
- `cordis.ts`：`ExecutionEnvironmentRegistry`、`filesFacilityPlugin`、`commandFacilityPlugin`、`createHostFilesPlugin`、空配置 Schema 与宿主文件插件的配置 Schema。
- `index.ts`：重导出根入口的四个函数与类型。

`index.ts` 与 `cordis.ts` 带 `PACKAGE_TEMPLATE_DRAFT` 注释，写明还没有接受的部分：`terminal` 提供者、Runtime Context 生产者插件、调用方类核对。具名维护者由负责人指定。
