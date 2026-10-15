# 图像成员模型

状态：技术设计已接受，见 [技术设计接受](https://github.com/nemori-ai/omne-harness-lite/issues/277#issuecomment-6198093789)。签名尚未实现。行为条件在 [SPEC](../SPEC.md)。

预算对象同时是策略门的结果和预留表的身份。六个上限留在对象内部。公开字段不重复它们。只有 `imageBudget` 能造出这个对象。调用方用 `heldReservation()` 读计数和字节。打开和关闭改这张表。

打开句柄和关闭句柄是两种类型。编码和关闭都在打开句柄上。关闭句柄没有编码。拒绝结果没有字节、没有声明、没有句柄。声明的信任值只有不可信。关闭句柄的原生停止只有未被证明。

```typescript
export const IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]
export type ImageMediaType = `image/${ImageFormat}`

export interface BudgetInput {
  readonly formats: readonly ImageMediaType[]
  readonly maxWidth: number
  readonly maxHeight: number
  readonly maxDecodedBytes: number
  readonly maxConcurrentDecodes: number
  readonly maxInFlightBytes: number
}

export type BudgetRejectReason =
  | 'formats'
  | 'max-width'
  | 'max-height'
  | 'max-decoded-bytes'
  | 'max-concurrent'
  | 'max-in-flight-bytes'

declare const imageBudgetBrand: unique symbol

/** Only `imageBudget` can construct this. The six ceilings stay inside. */
export interface ImageBudget {
  readonly [imageBudgetBrand]: true
  heldReservation(): { readonly count: number; readonly bytes: number }
}

export type BudgetResult =
  | { readonly kind: 'budget'; readonly budget: ImageBudget }
  | { readonly kind: 'rejected'; readonly reason: BudgetRejectReason }

export type ImageRejectReason =
  | 'empty'
  | 'truncated'
  | 'not-image'
  | 'format'
  | 'multi-frame'
  | 'width'
  | 'height'
  | 'decoded-bytes'
  | 'concurrent'
  | 'in-flight-bytes'
  | 'decode'

export interface ImageDeclaration {
  readonly mediaType: ImageMediaType
  readonly orientedWidth: number
  readonly orientedHeight: number
  readonly trusted: false
}

export interface OpenImageHandle {
  readonly phase: 'open'
  encode(request: { readonly format: ImageFormat }): Promise<EncodeResult>
  close(): Promise<CloseResult>
}

export interface ClosedImageHandle {
  readonly phase: 'closed'
  readonly reservation: 'released'
  readonly nativeStop: 'not-proven'
  close(): Promise<ClosedImageHandle>
}

export type CloseResult =
  | { readonly kind: 'closed'; readonly handle: ClosedImageHandle }
  | { readonly kind: 'still-open'; readonly handle: OpenImageHandle }

export type EncodeResult =
  | {
      readonly kind: 'encoded'
      readonly mediaType: ImageMediaType
      readonly bytes: Uint8Array
      readonly orientation: 'absent'
      readonly exif: 'absent'
    }
  | { readonly kind: 'rejected'; readonly reason: 'closed' | 'encode' }

export type OpenResult =
  | { readonly kind: 'rejected'; readonly reason: ImageRejectReason }
  | {
      readonly kind: 'opened'
      readonly handle: OpenImageHandle
      readonly declaration: ImageDeclaration
      readonly verifiedBytes: Uint8Array
    }

export function imageBudget(input: BudgetInput): BudgetResult
export function open(input: {
  readonly bytes: Uint8Array
  readonly budget: ImageBudget
}): Promise<OpenResult>
```

解码库的类型不出现在这些签名里。
