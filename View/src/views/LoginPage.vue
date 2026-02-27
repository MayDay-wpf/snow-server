<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { getConfig } from "../config";
import {
  login,
  register,
  validateUsername,
  validatePassword,
} from "../api/auth";
import Select from "../components/Select.vue";
import {
  useTheme,
  setThemeMode,
  type ThemeMode,
} from "../composables/useTheme";
import { setLocale, getLocale } from "../locales";
import { useAlert } from "../composables/useAlert";
import {
  Settings,
  X,
  User,
  Lock,
  LogIn,
  UserPlus,
  Loader2,
  Download,
} from "lucide-vue-next";
import { saveToken, saveRefreshToken, saveUserInfo } from "../utils/auth";

const { t } = useI18n();
const router = useRouter();
const { currentMode } = useTheme();
const config = getConfig();
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

// 表单模式切换
const isLoginMode = ref(true);
const modeTitle = computed(() =>
  isLoginMode.value ? t("login.signIn") : t("login.signUp")
);
const switchText = computed(() =>
  isLoginMode.value ? t("login.noAccount") : t("login.hasAccount")
);
const switchAction = computed(() =>
  isLoginMode.value ? t("login.signUp") : t("login.signIn")
);

// 表单数据
const username = ref("");
const password = ref("");
const confirmPassword = ref("");

// 状态
const isLoading = ref(false);

// 重置表单
const resetForm = () => {
  username.value = "";
  password.value = "";
  confirmPassword.value = "";
};

// 切换模式
const toggleMode = () => {
  isLoginMode.value = !isLoginMode.value;
  resetForm();
};

// 表单验证
const validateForm = (): boolean => {
  const usernameResult = validateUsername(username.value);
  if (!usernameResult.valid) {
    alert.error(usernameResult.message);
    return false;
  }

  const passwordResult = validatePassword(password.value);
  if (!passwordResult.valid) {
    alert.error(passwordResult.message);
    return false;
  }

  if (!isLoginMode.value && password.value !== confirmPassword.value) {
    alert.error(t("login.passwordMismatch"));
    return false;
  }

  return true;
};

// 登录处理
const handleLogin = async () => {
  if (!validateForm()) return;

  isLoading.value = true;

  try {
    const result = await login({
      username: username.value,
      password: password.value,
    });

    if (result.success && result.data) {
      // 保存 token 到浏览器
      saveToken(result.data.token);

      // 保存 refreshToken（如果存在）
      if (result.data.refreshToken) {
        saveRefreshToken(result.data.refreshToken);
      }

      // 保存用户信息
      if (result.data.user) {
        saveUserInfo(result.data.user);
      }

      alert.success(t("login.loginSuccess") || "Login successful!");
      console.log("Login successful:", result.data);

      // 跳转到主页
      router.push({ name: "home" });
    } else {
      alert.error(result.message || t("login.loginFailed"));
    }
  } catch (error) {
    alert.error(t("login.loginError"));
    console.error("Login error:", error);
  } finally {
    isLoading.value = false;
  }
};

// 注册处理
const handleRegister = async () => {
  if (!validateForm()) return;

  isLoading.value = true;

  try {
    const result = await register({
      username: username.value,
      password: password.value,
    });

    if (result.success) {
      alert.success(
        t("login.registrationSuccess") || "Registration successful!"
      );
      console.log("Registration successful");
      isLoginMode.value = true;
      resetForm();
    } else {
      alert.error(result.message || t("login.registrationFailed"));
    }
  } catch (error) {
    alert.error(t("login.registerError"));
    console.error("Registration error:", error);
  } finally {
    isLoading.value = false;
  }
};

// 提交表单
const handleSubmit = () => {
  if (isLoginMode.value) {
    handleLogin();
  } else {
    handleRegister();
  }
};
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
</script>

<template>
  <div class="login-container" @click="closeSettings">
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
        </div>
      </div>
    </Transition>

    <div class="login-card">
      <div class="login-header">
        <div class="logo">
          <span class="logo-icon">❄</span>
          <span class="logo-text">{{ t("common.appName") }}</span>
        </div>
        <p class="subtitle">{{ t("common.subtitle") }}</p>
      </div>

      <form class="login-form" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="username">
            <User :size="14" class="label-icon" />
            {{ t("login.username") }}
          </label>
          <div class="input-wrapper">
            <User :size="18" class="input-icon" />
            <input
              id="username"
              v-model="username"
              type="text"
              :placeholder="t('login.enterUsername')"
              autocomplete="username"
              :disabled="isLoading"
            />
          </div>
        </div>

        <div class="form-group">
          <label for="password">
            <Lock :size="14" class="label-icon" />
            {{ t("login.password") }}
          </label>
          <div class="input-wrapper">
            <Lock :size="18" class="input-icon" />
            <input
              id="password"
              v-model="password"
              type="password"
              :placeholder="t('login.enterPassword')"
              autocomplete="current-password"
              :disabled="isLoading"
            />
          </div>
        </div>

        <div v-if="!isLoginMode" class="form-group">
          <label for="confirmPassword">
            <Lock :size="14" class="label-icon" />
            {{ t("login.confirmPassword") }}
          </label>
          <div class="input-wrapper">
            <Lock :size="18" class="input-icon" />
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              :placeholder="t('login.confirmYourPassword')"
              autocomplete="new-password"
              :disabled="isLoading"
            />
          </div>
        </div>

        <button type="submit" class="login-btn" :disabled="isLoading">
          <Loader2 v-if="isLoading" :size="16" class="btn-icon spinning" />
          <LogIn v-else-if="isLoginMode" :size="16" class="btn-icon" />
          <UserPlus v-else :size="16" class="btn-icon" />
          {{ isLoading ? t("login.processing") : modeTitle }}
        </button>

        <div class="form-switch">
          <span>{{ switchText }}</span>
          <a href="#" @click.prevent="toggleMode">{{ switchAction }}</a>
        </div>
      </form>

      <!-- PWA 安装按钮 -->
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

      <div class="login-footer">
        <p>{{ t("common.copyright", { name: config.appName }) }}</p>
      </div>
    </div>

    <div class="decorative-border"></div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(44, 36, 22, 0.02) 2px,
      rgba(44, 36, 22, 0.02) 4px
    ),
    linear-gradient(
      135deg,
      var(--color-bg) 0%,
      var(--color-bg-card) 50%,
      var(--color-bg) 100%
    );
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

.decorative-border {
  position: fixed;
  top: 8px;
  left: 8px;
  right: 8px;
  bottom: 8px;
  border: 2px solid var(--color-border);
  pointer-events: none;
  opacity: 0.15;
}

.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  padding: 40px 32px;
  position: relative;
}

.login-card::before {
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

.login-header {
  text-align: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--color-border-light);
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
}

.logo-icon {
  font-size: 32px;
  color: var(--color-accent);
}

.logo-text {
  font-family: "Courier New", Courier, monospace;
  font-size: 28px;
  font-weight: bold;
  letter-spacing: 8px;
  color: var(--color-text);
}

.subtitle {
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 6px;
}

.label-icon {
  opacity: 0.7;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  color: var(--color-text-muted);
  pointer-events: none;
  z-index: 1;
}

.form-group input[type="text"],
.form-group input[type="password"] {
  width: 100%;
  padding: 12px 14px 12px 42px;
  font-size: 14px;
  font-family: inherit;
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  outline: none;
  transition: background-color 0.2s, box-shadow 0.2s, border-color 0.2s;
}

.form-group input::placeholder {
  color: var(--color-text-light);
}

.form-group input:focus {
  background: var(--color-bg-input-focus);
  box-shadow: 3px 3px 0 rgba(44, 36, 22, 0.15);
  border-color: var(--color-accent);
}

.form-group input:focus + .input-icon {
  color: var(--color-accent);
}

.login-btn {
  width: 100%;
  padding: 14px 20px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 2px;
  text-transform: uppercase;
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-icon {
  flex-shrink: 0;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.login-btn:hover {
  background: var(--color-text-muted);
}

.login-btn:active {
  transform: translateY(1px);
}

.login-btn:disabled {
  background: var(--color-text-light);
  cursor: not-allowed;
  opacity: 0.7;
}

.form-switch {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}

.form-switch a {
  color: var(--color-text);
  text-decoration: none;
  margin-left: 6px;
  border-bottom: 1px dotted var(--color-text-light);
  padding-bottom: 1px;
}

.form-switch a:hover {
  border-bottom-style: solid;
}

.login-footer {
  text-align: center;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border-light);
}

.login-footer p {
  font-size: 11px;
  color: var(--color-text-light);
  margin: 0;
}

/* PWA 安装按钮 */
.install-app-btn {
  width: 100%;
  padding: 12px 20px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  background: var(--color-accent);
  color: var(--color-bg);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s, box-shadow 0.2s;
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.install-app-btn:hover {
  background: var(--color-text);
  box-shadow: 2px 2px 0 rgba(44, 36, 22, 0.15);
}

.install-app-btn:active {
  transform: translateY(1px);
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
</style>
