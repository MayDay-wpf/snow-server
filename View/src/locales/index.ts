import { createI18n } from "vue-i18n";
import en from "./en";
import zh from "./zh";

// 获取存储的语言或浏览器语言
const getStoredLocale = (): string => {
  const stored = localStorage.getItem("locale");
  if (stored) return stored;

  const browserLang = navigator.language.toLowerCase();
  return browserLang.startsWith("zh") ? "zh" : "en";
};

const i18n = createI18n({
  legacy: false, // 使用 Composition API
  locale: getStoredLocale(),
  fallbackLocale: "en",
  messages: {
    en,
    zh,
  },
});

export default i18n;

// 切换语言的辅助函数
export const setLocale = (locale: string) => {
  if (i18n.mode === "legacy") {
    i18n.global.locale = locale as any;
  } else {
    (i18n.global.locale as any).value = locale;
  }
  localStorage.setItem("locale", locale);
  document.documentElement.setAttribute("lang", locale);
};

// 获取当前语言
export const getLocale = (): string => {
  const locale = i18n.global.locale;
  if (typeof locale === "string") {
    return locale;
  }
  return locale.value;
};
