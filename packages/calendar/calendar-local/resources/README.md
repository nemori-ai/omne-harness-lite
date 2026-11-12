# resources

本目录说明 Calendar 本地运行资产的定位、出处与发行责任。实际字节在包内 data，读取入口由[公开 API](../docs/public-api.md)导航。

## 允许的内容

发行种子、原始来源、知识元数据、来源许可与完整性索引。单次下载日志和 QA 输出留任务 tmp。

## 边界

createShippedCalendarSeedRegistry 与 shippedCalendarSeedRelease 从根入口导出。metadata 给出 packRef、releaseRef、releaseDate 和 packHash，registry 读取 `data/seeds/calendar-2026-11-06.json` 原始字节并核 SHA-256。调用方显式接入 registry 和完整 importSeed 输入；导入模块不会安装日历或启动刷新。发行包的 data 清单、包内读取路径和实际 pack 字节须由发行拥有者一并核对，工作区存在文件不代表完成发行接受。

发行 pack 的每历 entry 保存快照、政策与原材料身份。`data/seeds/inputs-2026-11-06.json`、`provenance-2026-11-06.json`、`raw/` 和 `evidence/` 保存来源、取得依据及许可材料，固定 hash 以发行元数据为准，不在多页复制。损坏、缺材料、hash 不匹配或政策 unknown 明确失败，不降成默认日历。所声明种子至少覆盖发行自然年及权威已发布更远范围，逐历 critical 不得发行，warning 必须声明。

CN 保留 lanceliao 历史 truth，增加独立具名的 gov-cn-annual-notice truth。2027 公告与固定 cg-zhou commit 的逐日核对覆盖全年。独立性指采集和转录路径不同，不是两个法律制定机关。历史 truth 采用 chinese-days@1.5.9，2027 公告采用1.5.10，均只补 inLieu 的两个既有检查，不是新独立 oracle。封套保留 truth 与补充原文、来源、版本、覆盖及摘要。

US 固定法条为 govinfo USCODE-2023 §6103，保守制品依据与 OPM/FR 分开。无 METHOD 的 OPM ICS 仅在全部事件 DTSTAMP 合法且不晚于取得时点时采用组件修订依据，不宣称法律知识实时完整。发行 FR 语料显式限制 publication_date 为 2025-01-01 至 2026-11-02，截止为 America/New_York 2026-11-02 当日末；完成 count/pages 与实际记录校验后才采用该有界知识。发行计算窗口为 2025-01-01 至 2030-12-25，不虚构以后 oracle 覆盖。窗口、完整性、原文摘要和许可材料由本次发行输入唯一保存，HTTP Date、下载和安装时点不能替代知识截至。

## 维护

`tools/seeds/prepare-cn-2027.py` 解析已归档的七段公告并下载固定 oracle commit，遇不识别句式或逐日差异失败。随后 `generate.mjs` 经供给应用校验生成新版。旧2026-11-03 pack、输入与证据保持原字节，作为历史归档；当前政策下不承诺重新导入旧政策包。

`cnOfficialNoticeArtifact` 显式注入已采用公告的读取、SHA-256、出处及知识时间。该适配器可获取和探测制品变化，不自动发现未来年度公告。缺配置或制品失真返回不可用，刷新失败保留已发布覆盖。新公告仍需原文采用、独立核验及重新发行。

更新种子时同步原文、知识 resolver 依据、摘要、许可索引、公开读取入口和包内运行资产清单。不得用新的可变远端材料重写旧发行身份。种子跨合法安装 scope 使用来源 authority 身份，本机 SQL rawReference 不成为 pack 的可移植身份。

## 本包事实

A1 有具名三历离线种子读取入口与来源资产。本页不宣称当前 pack 已经通过发行门禁或真实系统装配。seed=null 的构件模式不降低完整发行物的离线义务。
