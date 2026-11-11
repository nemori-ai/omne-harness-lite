import { z } from 'zod'
import { isQualification, type Qualification } from '@omne-harness/identity'

export const qualificationsSchema = z
  .array(z.custom<Qualification>(isQualification))
  .max(16)
  .transform(values => [...new Set(values)].sort())
