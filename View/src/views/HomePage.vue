<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { clearAuth } from "../utils/auth";
import { LogOut, Settings, X, Download } from "lucide-vue-next";
import Select from "../components/Select.vue";
import {
  useTheme,
  setThemeMode,
  type ThemeMode,
} from "../composables/useTheme";
import { setLocale, getLocale } from "../locales";
import { useAlert } from "../composables/useAlert";

const { t } = useI18n();
const router = useRouter();
const { currentMode } = useTheme();
const alert = useAlert();

// 设置面板
const showSettings = ref(false);

// 语言选项
const localeOptions = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];
const currentLocale = ref(getLocale());

// 主题选项
const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "" },
  { value: "light", label: "" },
  { value: "dark", label: "" },
];

// 更新主题选项的标签
watch(
  () => currentLocale.value,
  () => {
    themeOptions[0]!.label = t("settings.themeSystem");
    themeOptions[1]!.label = t("settings.themeLight");
    themeOptions[2]!.label = t("settings.themeDark");
  },
  { immediate: true }
);

// 当前主题
const currentTheme = ref<ThemeMode>(currentMode.value);

// 监听主题变化
watch(currentTheme, (newTheme) => {
  setThemeMode(newTheme);
});

// 监听语言变化
watch(currentLocale, (newLocale) => {
  setLocale(newLocale);
});

// 切换设置面板
const toggleSettings = (event?: Event) => {
  event?.stopPropagation();
  showSettings.value = !showSettings.value;
};

// 关闭设置面板
const closeSettings = () => {
  showSettings.value = false;
};

// 阻止事件冒泡
const stopPropagation = (event: Event) => {
  event.stopPropagation();
};

// PWA 安装
const deferredPrompt = ref<any>(null);
const showInstallButton = ref(false);

// 检查是否已经安装
const checkIfInstalled = () => {
  // 检查是否在 standalone 模式下运行（已安装）
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }
  // 检查 iOS Safari
  if ((window.navigator as any).standalone === true) {
    return true;
  }
  return false;
};

// 监听 PWA 安装提示事件
const handleBeforeInstallPrompt = (e: any) => {
  console.log("beforeinstallprompt event fired");
  e.preventDefault();
  deferredPrompt.value = e;
  if (!checkIfInstalled()) {
    showInstallButton.value = true;
  }
};

// 监听 PWA 安装成功事件
const handleAppInstalled = () => {
  console.log("App installed");
  showInstallButton.value = false;
  deferredPrompt.value = null;
  alert.success(t("pwa.installed"));
};

// 注册事件监听器
window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
window.addEventListener("appinstalled", handleAppInstalled);

// 处理安装应用
const handleInstallApp = async () => {
  if (!deferredPrompt.value) {
    console.log("No deferred prompt available");
    alert.error(t("pwa.installFailed"));
    return;
  }

  try {
    deferredPrompt.value.prompt();
    const { outcome } = await deferredPrompt.value.userChoice;

    if (outcome === "accepted") {
      console.log("User accepted the install prompt");
      showInstallButton.value = false;
    } else {
      console.log("User dismissed the install prompt");
    }
  } catch (error) {
    console.error("Install error:", error);
    alert.error(t("pwa.installFailed"));
  }

  deferredPrompt.value = null;
};

const handleLogout = () => {
  clearAuth();
  router.push({ name: "login" });
};
</script>

<template>
  <div class="home-container" @click="closeSettings">
    <!-- PWA 安装按钮 - 移至顶部 -->
    <Transition name="install-button">
      <button
        v-if="showInstallButton"
        class="install-app-btn"
        @click="handleInstallApp"
        :title="t('pwa.installPrompt')"
      >
        <Download :size="16" class="btn-icon" />
        {{ t("pwa.installApp") }}
      </button>
    </Transition>

    <!-- 设置按钮 -->
    <button
      class="settings-btn"
      @click="toggleSettings"
      :title="t('settings.theme')"
    >
      <X v-if="showSettings" :size="20" />
      <Settings v-else :size="20" />
    </button>

    <!-- 设置面板 -->
    <Transition name="settings-panel">
      <div v-if="showSettings" class="settings-panel" @click="stopPropagation">
        <div class="settings-header">
          <h3>{{ t("common.appName") }}</h3>
        </div>
        <div class="settings-content">
          <Select
            v-model="currentLocale"
            :options="localeOptions"
            :label="t('settings.language')"
          />
          <Select
            v-model="currentTheme"
            :options="themeOptions"
            :label="t('settings.theme')"
          />
          <!-- 退出登录按钮 - 移至设置面板 -->
          <button
            class="logout-btn-settings"
            @click="handleLogout"
            :title="t('home.logout') || 'Logout'"
          >
            <LogOut :size="16" />
            <span>{{ t("home.logout") || "Logout" }}</span>
          </button>
        </div>
      </div>
    </Transition>

    <div class="content-section">
      <p>
        {{
          t("home.description") ||
          "This is your home page. More features coming soon!"
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  min-height: 100vh;
  padding: 2rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.content-section {
  padding: 2rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  margin-top: 80px;
}

.content-section p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 设置按钮 */
.settings-btn {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  transition: background-color 0.2s, box-shadow 0.2s;
}

.settings-btn:hover {
  background: var(--color-bg);
  box-shadow: 2px 2px 0 rgba(44, 36, 22, 0.15);
}

/* 设置面板 */
.settings-panel {
  position: fixed;
  top: 70px;
  right: 20px;
  width: 280px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  z-index: 99;
}

.settings-panel::before {
  content: "";
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  bottom: 4px;
  border: 1px solid var(--color-border);
  opacity: 0.3;
  pointer-events: none;
}

.settings-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-light);
}

.settings-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--color-text);
}

.settings-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 设置面板过渡动画 */
.settings-panel-enter-active,
.settings-panel-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.settings-panel-enter-from,
.settings-panel-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 安装按钮过渡动画 */
.install-button-enter-active,
.install-button-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.install-button-enter-from,
.install-button-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 退出登录按钮样式 - 设置面板内 */
.logout-btn-settings {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  margin-top: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  transition: background-color 0.2s, box-shadow 0.2s;
}

.logout-btn-settings:hover {
  background: var(--color-accent);
  color: var(--color-bg);
  box-shadow: 2px 2px 0 rgba(44, 36, 22, 0.15);
}

/* PWA 安装按钮 - 底部样式 */
.install-app-btn {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 1px;
  text-transform: uppercase;
  background: var(--color-accent);
  color: var(--color-bg);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s, box-shadow 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  z-index: 98;
  width: auto;
  white-space: nowrap;
}

.install-app-btn:hover {
  background: var(--color-text);
  box-shadow: 2px 2px 0 rgba(44, 36, 22, 0.15);
}

.install-app-btn:active {
  transform: translateX(-50%) translateY(1px);
}

/* 移动端响应式 */
@media (max-width: 768px) {
  .home-container {
    padding: 1rem;
  }

  .settings-btn {
    top: 10px;
    right: 10px;
    width: 36px;
    height: 36px;
  }

  .settings-panel {
    top: 56px;
    right: 10px;
    left: 10px;
    width: auto;
  }

  .content-section {
    padding: 1.5rem;
  }

  .install-app-btn {
    font-size: 11px;
    padding: 8px 16px;
    bottom: 10px;
  }
}

@media (max-width: 480px) {
  .home-header h1 {
    font-size: 1.25rem;
  }

  .user-details h2 {
    font-size: 1.25rem;
  }

  .settings-header h3 {
    font-size: 12px;
  }

  .settings-content {
    padding: 16px;
  }
}
</style>
