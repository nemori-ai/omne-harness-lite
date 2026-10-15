# @omne-harness/call-account

[English](README.md)

一次模型调用或一次工具执行的调用账目。

## 职责与状态

本成员检查一份账的快照，用更大的修订替换旧快照，并计算一个来源的小计或应付金额。模型调用和工具执行使用同一形状，用 subject 种类区分。会话把账写入会话日志。请求上下文不导入本包。业务账的拥有者保存持久记录。流装配不携带用量和费用。

## 使用

```ts
import { judgeCallAccount, payableAmount } from '@omne-harness/call-account'

const account = {
  subject: { kind: 'model_call', id: 'call_01' },
  usage: [{ name: 'input', state: 'known', lexeme: '128', unit: 'token' }],
  cost: [
    { state: 'known', lexeme: '1.00', unit: 'USD', source: 'supplier' },
    { state: 'known', lexeme: '1.50', unit: 'USD', source: 'billable' },
    { state: 'known', lexeme: '1.50', unit: 'USD', source: 'ledger' },
  ],
  trimmed: { state: 'unknown', unit: 'token' },
  place: 'provider-a',
  duration: 'PT1.5S',
  receipt: 'received',
  revision: '0',
}

judgeCallAccount(account)
payableAmount(account)
```

模型和工具产出这份值。会话在后一份快照到达时调用 `admitRevision`，再调用 `payableAmount`。样例不是已经接上的生产调用。没有 Cordis 入口。

## 契约

`judgeCallAccount` 返回 `{ ok }` 或 `{ rejected }`。未知金额只有 `unit`，没有 `lexeme`。已知和暂估同时有这两项。`USD` 超过两位小数，或 `token` 词法带小数，拒绝码是 `precision`。时长字符串必须是 `utc-instant` 能接受的 SI 秒。`{ "state": "unknown" }` 也是一种时长。

`admitRevision` 在下一份修订更大时返回下一份快照。修订相同则返回第一份，不论内容是否相同。subject 不同则拒绝码是 `subject`。

`sourceSubtotal` 只加一个来源里 `known` 的金额。暂估和未知不进入。单位不同则拒绝码是 `unit`。`payableAmount` 返回已知 `ledger` 小计。该小计未知时，返回已知 `billable` 小计。`supplier` 和 `observation` 不是应付金额。上面的样例里应付词法是 `1.50`。`canonicalAccount` 把该词法写成 JSON 字符串。再解析并准入后，词法文本不变。

## 设计

`src/index.ts` 拥有准入、修订、小计和应付选择。`src/decimal.ts` 用系数和指数相加十进制词法。它不对系数调用 `Number`。

一笔金额是未知、已知或暂估。这三种状态不共用一个可缺的 lexeme。

## 配置与运行

本包不读环境。`engines.node` 保持 `>=24.18.0 <25`。

## 验证

`pnpm --filter @omne-harness/call-account test` 运行 `tests/public-entry.spec.ts`。测试覆盖未知费用、`precision`、修订替换、应付金额 `1.50` 和混单位。本包是纯值，所以没有存储集成测试，也没有用户旅程端到端测试。

## 维护

token 类别名留在模型调用。会话日志留在会话。账本持久化留在业务账的拥有者。
