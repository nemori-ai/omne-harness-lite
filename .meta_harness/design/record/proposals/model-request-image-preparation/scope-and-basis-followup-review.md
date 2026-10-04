# D109 施工接缝定点评审记录

2026-09-29。原 D109 技术采用之后施工反查发现两处未充分表达的资源/参数交接。本记录追加候选，不改已采用 v15 r4/v21 r3。主线负责后继接受；独立评审不是实现验收。

## 对象及边界

- [runtime scope cleanup r2](../../../realization/packages/model/model-request-runtime/image-preparation-scope-cleanup-candidate.md)：SHA256 `2806c562cef964cdd979d2aaeb5ccba90484db7de84997ed213efb40ae8ec2a3`。
- [transport scope cleanup r2](../../../realization/packages/model/pi-ai-transport/image-preparation-scope-cleanup-candidate.md)：SHA256 `22900fa7eb39b74a6af81b6544eb0d190063d42ecc2a7bba2df0308b6a6bd8ab`。
- [transport basis applicability r3](../../../realization/packages/model/pi-ai-transport/image-preparation-basis-applicability-candidate.md)：SHA256 `78b85967d2935ba01d5ad64687ce080cf025ffb266c287199048c78137bea781`。

既有封存领域读数仍为性质输入，不重新声称双盲。没有新增产品要求、领域对象、规范版本、公开InputMeter字段或Cordis服务。新增实际bindings为0。两位原 reviewer 分别为独立 architecture-reviewer 与 spec-reviewer，只读给出报告，作者汇录事实；未委托作者自己评审。

## Cleanup 轮次

r1 runtime `80a0b9c8b0eda37fcdaba634c9a53673a999c9bc5ef6b5cf0596ccac8944dc5f`、transport `f6254407e77113432c75dd88dfdb78e1310df8916c0108bb620cb2ac73d1a43a`：表达评审未见阻断，架构指出实际 async 函数可赋给void口，单查typeof function不能防止Promise返回被误认为同步成功。

r2补明确实际返回必须undefined、thenable原owner持有直到观察终结、pending不重试、不报released；三消费边界覆盖。两reviewer对以上最终r2摘要均无各自范围阻断。固定acquirer捕获service、清理能力独立于准入与lease生存、失败scope受maxScopes限制，与716400a3原runtime.close可重试unavailable及registry失败留责核对相容。

## Basis 轮次

r1错误把当前三行sourceBindings/target8写为716400a3事实。两reviewer用git show复核指出716只有两行/target7。作者查明新增第三行/target8来自已提交后继8125e085adfdb78bd9fa06381fb5127124f659bb；r2明确区分基线，不用当前工作树冒充旧commit。

r2 `8abf78321b62e2d8f916cb286740f0a832456a67a1a02bb1f8203f8d4d8e8059`：架构无阻断；表达阻断指出relation unavailable到fallbackReason不够精确，以及现源码basis先于prefix不能冒充RT10顺序。

r3新增精确映射：独立于relation返回判别，RT10的basis_changed含无法判兼容；source_unavailable只对应实际来源/口径不可用；先source、no_observation、prefix、basis；full仍按家族原表判断O。两reviewer对 `32ba2d86a3e2202afc22105214a4028d873aab2be239ecf5b99c0169b01ef521` 已无阻断。表达指出两处非阻断词修：unknown source不判changedEffective（不要写不记basis_changed）、requestInput判别应unavailable；作者已修改成上列最终r3字节；两reviewer均回读该最终摘要，确认两处词修关闭、各自范围无阻断。

## 证据范围

本页不声称SC1～9、BR1～7、动态多代际装配或真实缓存释放已执行。来源核对是精确源码+RT10/MR9对照；设计/docs检查只验证文档与登记结构。工程行为、状态码、计量和真实图片请求仍由实现及验收owner取证；正式采用由主线另记D109后继。
