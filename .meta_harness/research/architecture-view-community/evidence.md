# 来源与有限观察

取证日期：2026-10-03。正文只采用官方页面及根会话实际探针。
网络页面未钉出版版本的，按本次读取日期限定；将来消费前须复核。
本轮没有独立第三方的人因或性能实证，不能把厂商说明升级为实效结论。

## E1：表达与过滤

- [C4 图层级](https://c4model.com/diagrams)、[标记指南](https://c4model.com/diagrams/notation)：方法作者说明，本次读取页面。
  观察：有图层级、元素类别、图例和关系方向要求；C4 本身不强制固定颜色或一种图形标记。
- [Structurizr 过滤视图](https://docs.structurizr.com/ui/diagrams/filtered-view)、[自动布局](https://docs.structurizr.com/ui/diagrams/automatic-layout)：官方文档，本次读取页面。
  观察：可基于已有视图过滤；自动布局结果不合适时文档允许转人工布局。
- 限制：没有实际部署 Structurizr；未验证人工布局维护成本。

## E2：目录折叠与焦点

- [dependency-cruiser v18.5.0 CLI](https://github.com/sverweij/dependency-cruiser/blob/v18.5.0/doc/cli.md)：官方源码文档。
  标签由 git ls-remote 核得 `0e2693532f4193278f1f799ea81e0362dd63eb17`。
  本轮还读取了 main 的同页，main 当时为 `a210586ea2a3c0501153e4a39925cee325fe0b3f`。
- 观察：collapse、focus、focus-depth 及邻接展示功能存在。
- 取得方式：精确 SHA 页面在网页工具打开失败；随后用 curl 读取官方 raw 的 v18.5.0 正文。
  CLI 正文 SHA-256 为 `8371319f3cfb000c4bd805b3a71794e0f711977b9c540468b241e714c42e20d8`。
  focus、focus-depth、collapse 小节分别在 974、989、1116 行。
  限制：本轮没有再次运行它的抽取器。
  本仓库原先的 18.5.0 试用归[已有调查](../architecture-judgment-aids/evidence.md)，本轮不重述其结果。

## E3：ELK 版本与探针

- [elkjs 0.12.0 README](https://github.com/kieler/elkjs/blob/ff5771d7165445c42c408bb8a090c8035272218c/README.md)：官方固定修订，已读正文。
- [ELK layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)：官方算法说明，按本次读取日期限定。
- pnpm 10.28.1 在当前工作树锁定安装 elkjs 0.12.0。Node 24.21.0 读取官方 bundle，为 1,609,707 字节。
- 实际命令：node --input-type=module，通过安装的 elk.bundled.js 建立 ELK 实例。
  输入三节点 A/B/C、A→B、B→C、C→A 及第二条 A→B，使用 layered/RIGHT/ORTHOGONAL。
  JSON 节点身份带方括号和引号。实际返回三节点位置和四边 sections，保留多边和方向。
  输出后调用 terminateWorker 抛 `TypeError: this.worker.terminate is not a function`，该命令退出 1。
  不能把它报告为整条探针通过；错误不支持布局失败结论。
- 本任务原件：`tmp/arch-intent/n2/community-probe/elk.json`；临时探针不是公开产品契约。
- 浏览器实际执行：Chromium 140.0.7339.16，file://，屏蔽 HTTP/HTTPS。
  三个焦点 clock/storage-sql/tenancy-host 分别为 21/27/19 节点、28/32/34 边。
  页面显示布局完成，放大和适应操作改变/恢复 viewBox；pageerror 和网络请求均为 0。
  这是未提交工作树上的实施者抽检，不能替代新候选独立验收。

## E4：矩阵与关系图

- [NDepend DSM](https://www.ndepend.com/docs/dependency-structure-matrix-dsm/1000)、
  [Lattix 界面与方向](https://docs.lattix.com/lattix/userGuide/Lattix_Architect_User_Interface.html)：官方说明，本次读取页面。
- 观察：矩阵与图可映射同一组关系；Lattix 说明行/列两个方向都可配置。
  本轮没有安装或购买这两项产品，没有验证其宣传的分析收益。
- 实施者探针：N1 输入派生出 12 个目录/应用组、41 条跨组直接边。
  截图 `tmp/arch-intent/n2/community-probe/overview.png` 显示全图适应后标签过小。
  这只否定本次参数下“换成 layered 就足够可读”的假设，不否定该算法。
