import { I18nextProvider, useTranslation, initReactI18next } from "react-i18next";
import { i18next } from "./index.js";

// Register react-i18next plugin as a side-effect.
// This must run before initI18n() is called in React contexts.
i18next.use(initReactI18next);

export { I18nextProvider, useTranslation, i18next };

export function I18nProvider({ children }: { children: React.ReactNode }) {
  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
}
