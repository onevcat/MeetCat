import i18next, { type TFunction } from "i18next";
import en from "./locales/en.js";
import zh from "./locales/zh.js";
import ja from "./locales/ja.js";
import ko from "./locales/ko.js";

export type SupportedLanguage = "en" | "zh" | "ja" | "ko";
export type LanguageSetting = "auto" | SupportedLanguage;

const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["en", "zh", "ja", "ko"];

/**
 * Detect language from browser/system locale.
 * Returns the best matching supported language, defaulting to "en".
 */
export function detectLanguage(): SupportedLanguage {
  if (typeof navigator === "undefined") return "en";

  const navLang = navigator.language.toLowerCase();
  for (const lang of SUPPORTED_LANGUAGES) {
    if (navLang.startsWith(lang)) return lang;
  }
  return "en";
}

/**
 * Resolve the actual language from a language setting value.
 */
export function resolveLanguage(setting: LanguageSetting | undefined): SupportedLanguage {
  if (!setting || setting === "auto") return detectLanguage();
  return setting;
}

let initialized = false;

/**
 * Initialize i18next with the given language.
 * Safe to call multiple times - subsequent calls only change language.
 */
export async function initI18n(language?: LanguageSetting): Promise<void> {
  const resolvedLang = resolveLanguage(language);

  if (initialized) {
    if (i18next.language !== resolvedLang) {
      await i18next.changeLanguage(resolvedLang);
    }
    return;
  }

  await i18next.init({
    lng: resolvedLang,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    resources: {
      en: { translation: en },
      zh: { translation: zh },
      ja: { translation: ja },
      ko: { translation: ko },
    },
  });

  initialized = true;
}

/**
 * Change the current language.
 */
export async function changeLanguage(language: LanguageSetting): Promise<void> {
  const resolved = resolveLanguage(language);
  await i18next.changeLanguage(resolved);
}

/**
 * Get the translation function.
 * Must call initI18n() before using this.
 */
export function getT(): TFunction {
  return i18next.t.bind(i18next);
}

/**
 * Translate a key. Shorthand for i18next.t().
 * Must call initI18n() before using this.
 */
export const t: TFunction = ((...args: Parameters<TFunction>) =>
  i18next.t(...args)) as TFunction;

export { i18next };
