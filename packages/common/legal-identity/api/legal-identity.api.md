# @omne-harness/legal-identity 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AccountId` · `index.d.ts`
- `IDENTITY_TYPE_NAMES` · `index.d.ts`
- `IdentityTextCodec` · `index.d.ts`
- `IdentityTextError` · `index.d.ts`
- `IdentityTextResult` · `index.d.ts`
- `LoginStateId` · `index.d.ts`
- `OrganizationId` · `index.d.ts`
- `ScopeLayerIdentity` · `index.d.ts`
- `TenantId` · `index.d.ts`
- `accountCodec` · `index.d.ts`
- `accountEquals` · `index.d.ts`
- `loginStateCodec` · `index.d.ts`
- `loginStateEquals` · `index.d.ts`
- `organizationCodec` · `index.d.ts`
- `organizationEquals` · `index.d.ts`
- `scopeLayerCodec` · `index.d.ts`
- `scopeLayerEquals` · `index.d.ts`
- `tenant` · `index.d.ts`
- `tenantCodec` · `index.d.ts`
- `tenantEquals` · `index.d.ts`

## 声明文件 `index.d.ts`

```ts
declare const IDENTITY_SPECS: readonly [
    {
        readonly name: 'AccountId';
        readonly prefix: 'acc_';
    },
    {
        readonly name: 'OrganizationId';
        readonly prefix: 'org_';
    },
    {
        readonly name: 'LoginStateId';
        readonly prefix: 'lgn_';
    },
    {
        readonly name: 'TenantId';
    },
    {
        readonly name: 'ScopeLayerIdentity';
    }
];
type IdentitySpec = (typeof IDENTITY_SPECS)[number];
type AtomicSpec = Extract<IdentitySpec, {
    readonly prefix: string;
}>;
type AtomicName = AtomicSpec['name'];
export declare const IDENTITY_TYPE_NAMES: readonly ("AccountId" | "LoginStateId" | "OrganizationId" | "ScopeLayerIdentity" | "TenantId")[];
interface AtomicIdentity<N extends AtomicName> {
    readonly name: N;
    readonly text: string;
}
export type AccountId = AtomicIdentity<'AccountId'>;
export type OrganizationId = AtomicIdentity<'OrganizationId'>;
export type LoginStateId = AtomicIdentity<'LoginStateId'>;
export interface TenantId {
    readonly name: 'TenantId';
    readonly organization: OrganizationId;
    readonly account: AccountId;
}
export type ScopeLayerIdentity = {
    readonly name: 'ScopeLayerIdentity';
    readonly layer: 'organization';
    readonly organization: OrganizationId;
} | {
    readonly name: 'ScopeLayerIdentity';
    readonly layer: 'tenant';
    readonly tenant: TenantId;
};
export interface IdentityTextError {
    readonly kind: 'identity-text-error';
    readonly code: 'type' | 'lexicon' | 'whitespace' | 'case' | 'extra-member' | 'missing-member' | 'family';
}
export type IdentityTextResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: IdentityTextError;
};
export interface IdentityTextCodec<T> {
    readonly parse: (text: string) => IdentityTextResult<T>;
    readonly encode: (value: T) => IdentityTextResult<string>;
}
export declare const accountCodec: IdentityTextCodec<AccountId>;
export declare const organizationCodec: IdentityTextCodec<OrganizationId>;
export declare const loginStateCodec: IdentityTextCodec<LoginStateId>;
export declare function accountEquals(left: AccountId, right: AccountId): boolean;
export declare function organizationEquals(left: OrganizationId, right: OrganizationId): boolean;
export declare function loginStateEquals(left: LoginStateId, right: LoginStateId): boolean;
export declare function tenant(organization: OrganizationId, account: AccountId): TenantId;
export declare const tenantCodec: IdentityTextCodec<TenantId>;
export declare function tenantEquals(left: TenantId, right: TenantId): boolean;
export declare const scopeLayerCodec: IdentityTextCodec<ScopeLayerIdentity>;
export declare function scopeLayerEquals(left: ScopeLayerIdentity, right: ScopeLayerIdentity): boolean;
export {};
```
