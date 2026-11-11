export type InquiryPolicy = Readonly<{
  onAsk: 'deny' | 'ask-human' | 'skip-ask'
}>

export type InquiryRequirement = 'none' | 'required' | 'prohibited' | 'unavailable'
export type InquiryDisposition = 'continue' | 'ask-human' | 'deny' | 'unavailable'

/** Handles an inquiry after structural judgment; continue does not grant execution authority. */
export function decideInquiry(
  requirement: InquiryRequirement,
  policy: InquiryPolicy | null,
): InquiryDisposition {
  switch (requirement) {
    case 'prohibited':
      return 'deny'
    case 'unavailable':
      return 'unavailable'
    case 'none':
      return 'continue'
    case 'required':
      if (policy === null) return 'unavailable'
      return policy.onAsk === 'skip-ask' ? 'continue' : policy.onAsk
  }
}
