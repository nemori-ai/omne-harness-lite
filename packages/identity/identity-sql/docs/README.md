# docs

本目录承载 `@omne-harness/identity-sql` 的内部设计、公开使用与集成说明，并向唯一契约与公开定义导航。

## 允许的内容

六个固定专题：`architecture.md`、`flows.md`、`object-model.md`、`public-api.md`、`context.md`、`cordis.md`。按实际阅读任务增加的指南、参考、配置或维护专题。文本图源与图片。

## 边界

非类型行为的唯一正文是包根 `SPEC.md`，精确类型归 `src/` 的公开定义。专题解释和导航，不复制签名、行为条款或系统架构。专题内容过多时可升级为同名目录，目录内必须有 `README.md` 与 `index.md`，原 `.md` 文件随之删除。

## 维护

专题拆分、改名或新增时，同步包根入口、本目录 `index.md`、章节锚点与 `documentation.json` 的登记路径。

## 本包事实

六个专题都已写成正文。`architecture.md` 写模块与机制，`flows.md` 写四个流程与插件生命周期，`object-model.md` 写六张表与主线程对象，`public-api.md` 索引两个入口的导出，`context.md` 写调用方的四件事与消费者，`cordis.md` 写插件与 IC 核对表。没有额外专题。负责人是本成员的写者，当前没有缺口。
