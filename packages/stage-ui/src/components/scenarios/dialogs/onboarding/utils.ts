import type { InjectionKey, Ref } from 'vue'

import type { UnifiedProviderMetadata } from '../../../../stores/providers/types'

export interface OnboardingContext {
  selectedProviderId: Ref<string>
  selectedProvider: Ref<(UnifiedProviderMetadata & { localizedName?: string, localizedDescription?: string }) | null>
  onboardingProviders: Ref<(UnifiedProviderMetadata & { localizedName?: string, localizedDescription?: string })[]>
  selectProvider: (provider: { id: string }) => void
  handleNextStep: (configData?: { apiKey: string, baseUrl: string, accountId: string }) => Promise<void>
  handlePreviousStep: () => void
  handleSave: () => void
}

export const OnboardingContextKey: InjectionKey<OnboardingContext> = Symbol('onboarding-context')
