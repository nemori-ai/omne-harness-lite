# 2026-09-26 · Core 值模块验证

本 run 首批登记 model-profile 在 W2 中确实发生的作者运行与主调度独立 HUB 运行。
登记检出基线 `633b20195c8a5f3f89a7e151e9236f6deea704e6`；登记过程没有重新运行产品测试。
消费者为 [model-profile 实现节点](../../../realization/packages/core/model-profile/README.md)，最终签收归主调度。
实现、验证、独立评审和用户最终接受分开；本 run 不表示整个系统已验收。

## 采用与原件

采用 `omne-harness-lite-design-2026-09-15 · data.model-profile · v1`；[catalog](../../../registry/catalog.json) 与
[D-041](../../decisions/assets-runtimes-contract-acceptance/decision.md) 登记 accepted，[D-042](../../decisions/assets-runtimes-node-acceptance/decision.md)／
[D-045](../../decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md) 给出节点采用边界。
部分历史正文仍写 candidate／源码不存在，不能代替版本外接受登记或本次实现事实；冻结正文未改。

- 实现 `cd67215ba1a36cf1108af4e5fd23bc49c15f5671`，spoke 起点 `47c4990a`；HUB merge `735ee728`。
- [作者原件](raw/model-profile/handoff.md)、[机器执行索引](raw/model-profile/results.json)、[Vitest JSON](raw/model-profile/vitest.json) 等17文件
  来自主树保存副本，原[外层 SHA 清单](raw/model-profile-SHA256.json)逐文件核对相符。原[作者清单](raw/model-profile/sha256-manifest.json)仍保留。
- 作者 metadata 的153项实际输入全部核对：53项从实现提交恢复、100项实际构建产物与保留的 HUB 字节相符；不是以源码hash替代声明／JS产物hash。
  [audit.json](audit.json) 保存原路径、来源、哈希与扁平快照映射；快照全部用 `.snapshot.txt`，作为当次输入，不成为第二份契约权威。
- 三份冻结规范 hash 与 registry 相符；包内 Schema 与规范逐字节相同：`4b3b1cb0cf76093d7c1d47be7d2f491cdfe44d2feb5a04c28af6483e6c4f8b24`。
  [SHA256.json](SHA256.json) 逐文件绑定归档；原 log／JSON不格式化、不覆盖。

## 实际执行

HUB 命令与退出码由主调度独立 exec 提供，原 stdout已复制；作者命令、cwd与退出码另在results.json自记录。

| 运行 | 实际命令／输入状态 | 实际结果与原文 |
|---|---|---|
| 作者最终包验证，提交cd67215b的同字节待提交实现，原起点47c4990a | `pnpm --filter @omne-harness-lite/model-profile run build`／`run typecheck`；`exec vitest run --reporter=verbose --reporter=json --outputFile=../../../tmp/w2-model-profile/vitest.json` | 各退出0，3文件 **185/185**，0失败／跳过；[build](raw/model-profile/build.log)、[typecheck](raw/model-profile/typecheck.log)、[test](raw/model-profile/test.log)、[JSON](raw/model-profile/vitest.json) |
| HUB包集成，从735ee728启动 | 先 `pnpm install --ignore-scripts` 加入新包importer，实际lock未提交，逐字节由稍后aa7c3d33恢复；包 `run build`／`run typecheck`／`run test` | 三命令各退出0，**185/185**、0跳过；[install](raw/hub/w2-model-profile-install.log)、[包log](raw/hub/w2-model-profile-hub.log)。735的锁快照只是提交起点，actual lock另列。随后f5e778d6只补W1证据、aa7提交实际锁，产品未变 |
| 作者公开消费者 | [consumer.mts](raw/model-profile/consumer/consumer.mts)、[tsconfig](raw/model-profile/consumer/tsconfig.json)，实际独立tsc与node；strict且skipLibCheck=false | 类型检查／runtime各0；[types原log](raw/model-profile/consumer-types.log)为空stdout，退出码在results；[runtime原log](raw/model-profile/consumer-runtime.log)。从公开dist/root及Schema消费，不走兄弟src |
| HUB独立公开消费者 | 起点aa7c3d33，复制作者源码／配置逐字节相同；`tsc -p tmp/core-delivery/model-profile-consumer/tsconfig.json` 与 `node tmp/core-delivery/model-profile-consumer/consumer.mts`，cwd为HUB | 各退出0；[源](raw/hub/model-profile-consumer/consumer.mts)、[配置](raw/hub/model-profile-consumer/tsconfig.json)、[types](raw/hub/w2-model-profile-consumer-types.log)、[runtime](raw/hub/w2-model-profile-consumer-runtime.log)。在同一set-e exec末尾才提交633b导航，期间仅3个开发导航文件dirty，产品／工具／配置无变 |
| 纯性与格式 | 作者本包24规则与格式check；HUB在aa7起点真实扫描model-profile与asset-model两个包，期间导航变化同上一行 | [作者scan](raw/model-profile/rules.log)／[format](raw/model-profile/format.log)各0；[HUB实际24规则scan](raw/hub/w2-purity-scan.log)退出0。asset-model此处只登记扫描输入范围，不登记该节点实现验收 |
| 作者环境smoke | 初始HEAD47c4990a启动 `make check`，但执行期间模型档案新包文件已开始写入 | [baseline.log](raw/model-profile/baseline.log)原样保留，退出0只作环境观察；**不是固定基线或本包验收**。阶段外既有成员34项skip与本包零skip分开，不把跳过标作通过 |

环境：Node **v24.18.0**、pnpm **10.28.1**、Vitest **4.1.11**、TypeScript **6.0.3**、Ajv **8.20.0**。
实际采用依赖是当次公开 content-blocks／identity-values／offer-expiry 构建产物；source/config/artifact各项哈希见audit。

## 范围与局限

[coverage.md](coverage.md) 按本地条款／test ID／原结果／外部owner对照；[model-profile-cases.tsv](model-profile-cases.tsv)是185具名结果的派生索引，原JSON才是执行原件。

- 155个冻结fixture属于表示与形状校验，另有跨字段、类型负例、精确数字、公开消费者等总185项；固定seed20260926的64个BigInt oracle案例在一条测试内，不另算64条Vitest测试。
- malformed先于其余九拒绝值；S-18对档案与建档内容各有正反例，Schema放行而完整judge拒绝的差异实际断言。
  四种judge文档不包括快照，快照只核类型／Schema形状。
- `refMatches`的custom分支由目录显式交scope，缺省不从环境补；boolean只答给定行是否匹配，不证明解析得到／查无／读不到三种目录收场。
- 数字域按content-blocks JsonNumber原文核整数、范围与比较，再作固定Schema视图；巨大指数与长小数是有限反例，不声称全部数值空间的形式证明。
- 本 run 没有目录写入、同格并发撞名、在册转移、updatedAt单调、租户授权、跨进程持久、实际出站参数／留痕、OpenRouter或每处JSON传递的验证。
  S-3/S-10/S-11、S-21/S-27等责任保持在目录／运行时／传输owner，不以本包fixture或纯性扫描闭合。
