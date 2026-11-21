import { CAPABILITIES } from "./capabilities";
import type { Platform } from "./types";

/** Ссылки в X считаются фиксированными 23 символами независимо от длины. */
export const X_URL_LENGTH = 23;
const URL_RE = /https?:\/\/\S+/g;

export function hasUrl(text: string): boolean {
  return /https?:\/\/\S+/.test(text);
}

export function countChars(platform: Platform, text: string): number {
  if (platform === "x") {
    const urls = text.match(URL_RE) ?? [];
    const withoutUrls = text.replace(URL_RE, "");
    return [...withoutUrls].length + urls.length * X_URL_LENGTH;
  }
  return [...text].length;
}

export function isWithinLimit(platform: Platform, text: string): boolean {
  return countChars(platform, text) <= CAPABILITIES[platform].maxChars;
}

/**
 * Тарифы X API (pay-per-use) на ноябрь 2026, по обзорам. Перед запуском сверить в Developer Console.
 * Хранятся в одном месте, чтобы стоимость считалась единообразно и менялась в одной правке.
 */
export const X_API_RATES_USD = {
  postRead: 0.005,
  ownedRead: 0.001,
  userRead: 0.01,
  postCreate: 0.015,
  postCreateWithUrl: 0.2,
} as const;

export function estimateXPostCost(text: string): number {
  return hasUrl(text) ? X_API_RATES_USD.postCreateWithUrl : X_API_RATES_USD.postCreate;
}

export function estimateXResearchCost(input: { postsRead: number; usersRead?: number }): number {
  const { postsRead, usersRead = 0 } = input;
  const cost = postsRead * X_API_RATES_USD.postRead + usersRead * X_API_RATES_USD.userRead;
  return Math.round(cost * 10000) / 10000;
}
