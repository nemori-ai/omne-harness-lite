# tests/fixtures

<!-- documentation:placeholder -->

本目录承载测试使用的固定输入。

## 允许的内容

<!-- documentation:placeholder -->

测试数据文件与说明。

## 边界

<!-- documentation:placeholder -->

固定输入不能代替规格；数据的来源与生成方式写在本 README。

`outlet-world.ts`：出站测试共用的世界。两个租户、每个租户一个目标，以及一个真实的账目投影（`createContextAccounting`），测试用空重放把目标重建为就绪。包装它的收件口记录每条事实与回执；`current` 只按投影的答复（`inserted`）更新，不自己判修订次序。

`context-world.ts`：请求准备与读取测试共用的世界。真实的是 Request Context 登记表与操作组（默认策略）、Runtime Context 机制、request-context-contract 的历史与采用替身。替身是 K-RQ 部件、K-RC 交接、Model 请求准备与 X-3 的准备资源（`createScriptedPreparationResources`，等 X-3 真件）。世界记录每个下游端口的调用次数。

## 维护

<!-- documentation:placeholder -->

输入格式或来源变化时，同步引用它的测试。

## 本包事实

<!-- documentation:placeholder -->

待补：本目录对本包的实际内容、负责人与当前缺口。不适用时写明理由，并在 `documentation.json` 把本文件记为 `not-applicable`。
