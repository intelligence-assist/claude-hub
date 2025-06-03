/**
 * Allowed webhook providers
 */
export const ALLOWED_WEBHOOK_PROVIDERS = ['github', 'claude'] as const;

export type AllowedWebhookProvider = (typeof ALLOWED_WEBHOOK_PROVIDERS)[number];

/**
 * Check if a provider is allowed
 */
export function isAllowedProvider(provider: string): provider is AllowedWebhookProvider {
  return ALLOWED_WEBHOOK_PROVIDERS.includes(provider as AllowedWebhookProvider);
}
