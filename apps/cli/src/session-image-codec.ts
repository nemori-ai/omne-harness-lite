import sharp from 'sharp'
import { createSharpImageCodec } from '@omne-harness-lite/image-codec'

export const sessionImageCodec = createSharpImageCodec(sharp)
