# @omne-harness/calendar-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `CalendarProtocol` · `calendar-protocol.d.ts`
- `calendarProtocol` · `calendar-protocol.d.ts`

## 声明文件 `calendar-protocol.d.ts`

```ts
export declare const calendarProtocol: {
    readonly operations: {
        readonly 'list-calendars': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly calendars: readonly {
                        readonly calendar: string;
                        readonly coverageEnd: string | null;
                        readonly coverageStart: string | null;
                        readonly timezone: string;
                        readonly version: string | null;
                    }[];
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'read-environment': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly calendar: string;
                    readonly revision: string;
                    readonly timezone: string;
                    readonly version: string | null;
                }>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "environment";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly answer: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly calendar: string;
                    readonly coverageEnd: string;
                    readonly coverageStart: string;
                    readonly result: {
                        readonly adjusted: boolean;
                        readonly classification: "holiday" | "nonWorkingDay" | "workingDay";
                        readonly date: string;
                        readonly kind: "day";
                        readonly working: boolean;
                    } | {
                        readonly count: number;
                        readonly from: string;
                        readonly kind: "count";
                        readonly to: string;
                    } | {
                        readonly date: string;
                        readonly kind: "shift";
                    } | {
                        readonly dates: readonly string[];
                        readonly kind: "next";
                    } | {
                        readonly date: string | null;
                        readonly kind: "nth";
                    };
                    readonly version: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "input" | "timezone";
                }>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{
                    readonly reason: "coverage" | "environment" | "search-limit";
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly question: {
                    readonly date: string;
                    readonly kind: "day";
                } | {
                    readonly from: string;
                    readonly kind: "count";
                    readonly to: string;
                } | {
                    readonly date: string;
                    readonly days: number;
                    readonly direction: "backward" | "forward";
                    readonly kind: "shift";
                } | {
                    readonly after: string;
                    readonly count: number;
                    readonly kind: "next";
                } | {
                    readonly kind: "nth";
                    readonly ordinal: number | "last";
                    readonly periodEnd: string;
                    readonly periodStart: string;
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "calendar";
    readonly major: 1;
    readonly observations: {};
};
export type CalendarProtocol = typeof calendarProtocol;
```

## 声明文件 `index.d.ts`

```ts
export { calendarProtocol, type CalendarProtocol } from './calendar-protocol.ts';
```
