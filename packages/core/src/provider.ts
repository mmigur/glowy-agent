import type {
  Platform,
  PlatformCapabilities,
  PostMetrics,
  PublishInput,
  PublishResult,
  RemoteProfile,
  SearchPage,
  SearchQuery,
  TokenSet,
} from "./types";

export type ProviderErrorKind =
  | "rate_limited"
  | "auth_expired"
  | "permission_denied"
  | "not_available"
  | "invalid_request"
  | "transient";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryAfterSec?: number;

  constructor(kind: ProviderErrorKind, message: string, retryAfterSec?: number) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    if (retryAfterSec !== undefined) this.retryAfterSec = retryAfterSec;
  }

  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "transient";
  }
}

/**
 * Единый контракт для соцсети. Реализации (X, Threads) появятся в Phase 6 и будут
 * работать только через официальные API. Остальные модули зависят от этого интерфейса,
 * поэтому новая сеть добавляется без изменения исследования, генерации и аналитики.
 */
export interface SocialProvider {
  readonly platform: Platform;
  readonly capabilities: PlatformCapabilities;

  buildAuthorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<TokenSet>;
  refreshToken(refreshToken: string): Promise<TokenSet>;

  getProfile(accessToken: string): Promise<RemoteProfile>;
  publish(accessToken: string, input: PublishInput): Promise<PublishResult>;
  fetchOwnPostMetrics(accessToken: string, platformPostIds: string[]): Promise<PostMetrics[]>;
  searchPublicPosts(accessToken: string, query: SearchQuery): Promise<SearchPage>;
}

export class ProviderRegistry {
  private readonly providers = new Map<Platform, SocialProvider>();

  register(provider: SocialProvider): this {
    this.providers.set(provider.platform, provider);
    return this;
  }

  get(platform: Platform): SocialProvider {
    const p = this.providers.get(platform);
    if (!p) throw new ProviderError("not_available", `Provider "${platform}" is not registered`);
    return p;
  }

  has(platform: Platform): boolean {
    return this.providers.has(platform);
  }
}
