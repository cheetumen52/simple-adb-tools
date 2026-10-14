import { create } from "zustand";
import { load, save } from "../lib/storage";
import { cs, type Messages } from "./cs";
import { en } from "./en";

export type Lang = "cs" | "en";
export type LangSetting = Lang | "system";
export type { Messages };

/** Supported languages, each named in its own language. */
export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: "cs", name: "Čeština" },
  { id: "en", name: "English" },
];

const dictionaries: Record<Lang, Messages> = { cs, en };

/** First supported language in the OS preference list; Slovak readers get Czech, anything else English. */
export function systemLang(preferred: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "cs" || base === "sk") return "cs";
    if (base === "en") return "en";
  }
  return "en";
}

const resolve = (setting: LangSetting): Lang => (setting === "system" ? systemLang() : setting);

interface I18nState {
  setting: LangSetting;
  lang: Lang;
  setSetting: (setting: LangSetting) => void;
}

const initial = load<LangSetting>("language", "system");

export const useI18n = create<I18nState>((set) => ({
  setting: initial,
  lang: resolve(initial),
  setSetting: (setting) => {
    save("language", setting);
    set({ setting, lang: resolve(setting) });
  },
}));

/** Messages for the current language, for stores and other non-React code. */
export const tr = (): Messages => dictionaries[useI18n.getState().lang];

/** Messages for the current language; the component re-renders when the language changes. */
export const useT = (): Messages => useI18n((s) => dictionaries[s.lang]);

/** BCP 47 tag for Intl formatting. */
export const locale = (): Lang => useI18n.getState().lang;
