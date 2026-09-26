# 纯路径导入小修与 JSON 工具依赖核对

提交：`46be369778959fa6b3cf8c1cb06a5c98cff6392f`。
工作树/分支：`core-delivery-checks` / `panqiwei/core-delivery-checks`；基线 `30f8786d`，status 干净。
只改 tools/ts-checks 三文件；根锁、产品源码、冻结规格和设计正文未改。

asset-model 的已接受 design「契约责任 → 模块公开入口」S-17 行明确使用 path.normalize 一类纯字面运算，
输入已是绝对路径，相对路径拒绝，不由 cwd 补齐。规则仅对 asset-model 增加 node:path/path，未为其他包扩大。
合法 fixture 用 isAbsolute + normalize；fs/Cordis/非core插件的拒绝仍必红。import 规则不独立证明调用者没有使用 resolve() 取 cwd，
实际输入约束仍应由 asset-model 实现测试核对。

MCP 全文核对：design 第10行只明确沿用 Ajv/Schema副本/拒绝次序的实现模式，第11行用 tool-definition 的 ToolName；
第63行依赖为 asset-model/tool-definition/identity-values/offer-expiry。没有直接采用 readJsonStrict/writeJsonLossless 的语句，
因此此次不增加 MCP → content-blocks 边；若调度者另确定该工具依赖，再更新采用登记和检查。未发现必须改冻结规格的语义冲突或环。
arrival-events 第10行明确金额用 content-blocks 严格无损读写，第58行已登记依赖，规则没有阻止它。
其余明确直接采用 JSON 工具的 asset-model/call-accounts/messages/model-response/stream-assembly/asset-evaluation
亦已有 content-blocks 登记；新增这7个节点的公开入口合法 fixture。

验证均通过：局部 format、工具 build/typecheck、6文件100 tests、源码 CLI 扫 packages/apps 24规则、构建 CLI 同样24规则、
make docs-check 957 Markdown、本地链接与镜像、git diff --check。环境仍为 Node24.18.0 / pnpm10.28.1 / TypeScript6.0.3 / Vitest4.1.11。
日志均在本目录，旧 w1-checks/*.log、coverage.json、handoff.md 未覆盖；input-hashes.json 保存修改文件及3个采用依据的SHA256。
本 spoke 的十五个新纯包仍无真实产品源码，新增 fixture 只证明规则边界，不冒充这些包已交付。
没有测试或工具进程仍在使用本树；当前调用者已释放。技术验收及是否退休仍交由主调度。
