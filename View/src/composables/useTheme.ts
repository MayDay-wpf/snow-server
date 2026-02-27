import { ref, onMounted, onUnmounted } from "vue";

export type ThemeMode = "system" | "light" | "dark";

const THEME_KEY = "theme-mode";

// 全局状态
const currentMode = ref<ThemeMode>("system");
const isDark = ref(false);

// 检测系统主题
const getSystemTheme = (): boolean => {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

// 应用主题
const applyTheme = (dark: boolean) => {
  isDark.value = dark;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
};

// 根据模式计算实际主题
const resolveTheme = (mode: ThemeMode): boolean => {
  if (mode === "system") {
    return getSystemTheme();
  }
  return mode === "dark";
};

// 设置主题模式
export const setThemeMode = (mode: ThemeMode) => {
  currentMode.value = mode;
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(resolveTheme(mode));
};

// 获取存储的主题模式
const getStoredMode = (): ThemeMode => {
  const stored = localStorage.getItem(THEME_KEY) as ThemeMode | null;
  if (stored && ["system", "light", "dark"].includes(stored)) {
    return stored;
  }
  return "system";
};

// 系统主题变化监听器
let mediaQuery: MediaQueryList | null = null;
const handleSystemThemeChange = (e: MediaQueryListEvent) => {
  if (currentMode.value === "system") {
    applyTheme(e.matches);
  }
};

// 初始化主题
export const initTheme = () => {
  currentMode.value = getStoredMode();
  applyTheme(resolveTheme(currentMode.value));

  // 监听系统主题变化
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", handleSystemThemeChange);
};

// 清理监听器
export const cleanupTheme = () => {
  if (mediaQuery) {
    mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }
};

// composable
export function useTheme() {
  onMounted(() => {
    // 确保主题已初始化
    if (document.documentElement.getAttribute("data-theme") === null) {
      initTheme();
    }
  });

  onUnmounted(() => {
    // 不在组件卸载时清理，因为主题是全局的
  });

  return {
    currentMode,
    isDark,
    setThemeMode,
  };
}
