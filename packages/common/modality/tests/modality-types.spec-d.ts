import { expectTypeOf, it } from 'vitest'
import type {
  MediaTypeJudgment,
  Modality,
  ModalitiesJudgment,
  ModalityJudgment,
} from '@omne-harness/modality'
import {
  MODALITIES,
  isCanonicalMediaType,
  judgeMediaType,
  judgeModalities,
  judgeModality,
  missingModalities,
} from '@omne-harness/modality'

it('is exactly the four modality literals', () => {
  expectTypeOf<Modality>().toEqualTypeOf<'text' | 'image' | 'voice' | 'video'>()
  expectTypeOf(MODALITIES).toEqualTypeOf<readonly Modality[]>()
})

it('gives a single modality only the type and modality rejections', () => {
  type Rejection = Extract<ReturnType<typeof judgeModality>, { rejected: unknown }>['rejected']
  expectTypeOf<Rejection>().toEqualTypeOf<'type' | 'modality'>()
  expectTypeOf<
    Extract<ReturnType<typeof judgeModality>, { ok: unknown }>['ok']
  >().toEqualTypeOf<Modality>()
})

it('adds duplicate and an index only to the list judgment', () => {
  type Rejected = Extract<ReturnType<typeof judgeModalities>, { rejected: unknown }>
  expectTypeOf<Rejected['rejected']>().toEqualTypeOf<'type' | 'modality' | 'duplicate'>()
  expectTypeOf<Rejected['index']>().toEqualTypeOf<number | null>()
  expectTypeOf<Extract<ReturnType<typeof judgeModalities>, { ok: unknown }>['ok']>().toEqualTypeOf<
    readonly Modality[]
  >()
})

it('gives the media type judgment its own rejections and a nullable modality', () => {
  type Judgment = ReturnType<typeof judgeMediaType>
  expectTypeOf<Extract<Judgment, { rejected: unknown }>['rejected']>().toEqualTypeOf<
    'type' | 'media-type'
  >()
  expectTypeOf<Extract<Judgment, { ok: unknown }>['ok']>().toEqualTypeOf<{
    mediaType: string
    modality: Modality | null
  }>()
})

it('takes unknown for judgment and typed lists for the set difference', () => {
  expectTypeOf(judgeModality).parameter(0).toEqualTypeOf<unknown>()
  expectTypeOf(judgeModalities).parameter(0).toEqualTypeOf<unknown>()
  expectTypeOf(judgeMediaType).parameter(0).toEqualTypeOf<unknown>()
  expectTypeOf(isCanonicalMediaType).parameters.toEqualTypeOf<[value: string]>()
  expectTypeOf(missingModalities).returns.toEqualTypeOf<readonly Modality[]>()
})

it('names each judgment result type exactly as its function returns it', () => {
  expectTypeOf(judgeModality).returns.toEqualTypeOf<ModalityJudgment>()
  expectTypeOf(judgeModalities).returns.toEqualTypeOf<ModalitiesJudgment>()
  expectTypeOf(judgeMediaType).returns.toEqualTypeOf<MediaTypeJudgment>()
})
