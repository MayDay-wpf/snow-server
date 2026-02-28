<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, onActivated } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { clearAuth, getUserInfo } from "../utils/auth";
import {
  LogOut,
  Settings,
  Download,
  Monitor,
  Wifi,
  WifiOff,
  RefreshCw,
  Power,
} from "lucide-vue-next";
import Select from "../components/Select.vue";
import {
  useTheme,
  setThemeMode,
  type ThemeMode,
} from "../composables/useTheme";
import { setLocale, getLocale } from "../locales";
import { useAlert } from "../composables/useAlert";
import {
  instanceHub,
  type InstanceInfo,
  type HubConnectionState,
} from "../api/instanceHub";

const { t } = useI18n();
const router = useRouter();
const { currentMode } = useTheme();
const alert = useAlert();

// 用户信息
const userInfo = ref<{ id: number; username: string } | null>(null);

// 实例列表
const instances = ref<InstanceInfo[]>([]);
const connectionState = ref<HubConnectionState>("disconnected");
const isConnecting = ref(false);

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

// 刷新页面
const refreshPage = (event?: Event) => {
  event?.stopPropagation();
  window.location.reload();
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
  instanceHub.disconnect();
  clearAuth();
  router.push({ name: "login" });
};

// ==================== SignalR 连接管理 ====================

// 连接状态文本
const connectionStatusText = ref("");

// 建立 SignalR 连接
const connectHub = async () => {
  if (isConnecting.value) return;

  isConnecting.value = true;
  try {
    await instanceHub.connect();
  } catch (error) {
    console.error("Failed to connect to hub:", error);
    alert.error(t("home.connectionFailed") || "Connection failed");
  } finally {
    isConnecting.value = false;
  }
};

// 断开连接
const disconnectHub = async () => {
  await instanceHub.disconnect();
};

// 重连
const reconnectHub = () => {
  disconnectHub().then(() => {
    setTimeout(() => {
      connectHub();
    }, 1000);
  });
};

// 处理实例连接事件
const handleInstanceConnected = (instance: InstanceInfo) => {
  const exists = instances.value.find(
    (i) => i.instanceId === instance.instanceId
  );
  if (!exists) {
    instances.value.push(instance);
  }
};
// 处理实例断开事件
const handleInstanceDisconnected = (instanceId: string) => {
  console.log("HomePage: Instance disconnected event received:", instanceId);
  console.log("Before filter, instances count:", instances.value.length);
  instances.value = instances.value.filter((i) => i.instanceId !== instanceId);
  console.log("After filter, instances count:", instances.value.length);
};

// 处理实例列表更新
const handleInstancesListUpdated = (newInstances: InstanceInfo[]) => {
  instances.value = newInstances;
};

// 处理连接状态变化
const handleConnectionStateChanged = (state: HubConnectionState) => {
  connectionState.value = state;
  switch (state) {
    case "connected":
      connectionStatusText.value = t("home.connected") || "Connected";
      break;
    case "connecting":
      connectionStatusText.value = t("home.connecting") || "Connecting...";
      break;
    case "reconnecting":
      connectionStatusText.value = t("home.reconnecting") || "Reconnecting...";
      break;
    case "disconnected":
      connectionStatusText.value = t("home.disconnected") || "Disconnected";
      break;
    case "error":
      connectionStatusText.value =
        t("home.connectionError") || "Connection error";
      break;
  }
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleString();
};

const showForceOfflineModal = ref(false);
const pendingForceOfflineInstance = ref<InstanceInfo | null>(null);
const forceOfflineSubmitting = ref(false);

const forceOfflineInstance = (instance: InstanceInfo, event: Event) => {
  event.stopPropagation();
  pendingForceOfflineInstance.value = instance;
  showForceOfflineModal.value = true;
};

const closeForceOfflineModal = () => {
  if (forceOfflineSubmitting.value) {
    return;
  }
  showForceOfflineModal.value = false;
  pendingForceOfflineInstance.value = null;
};

const confirmForceOffline = async () => {
  const instance = pendingForceOfflineInstance.value;
  if (!instance || forceOfflineSubmitting.value) {
    return;
  }

  forceOfflineSubmitting.value = true;
  try {
    await instanceHub.sendForceOffline(instance.instanceId);
    instances.value = instances.value.filter(
      (i) => i.instanceId !== instance.instanceId
    );
    alert.success(t("home.forceOfflineSuccess"));
    showForceOfflineModal.value = false;
    pendingForceOfflineInstance.value = null;
  } catch (error) {
    console.error("Force offline failed:", error);
    alert.error(t("home.forceOfflineFailed"));
  } finally {
    forceOfflineSubmitting.value = false;
  }
};

// 打开对话页面
const openChat = (instance: InstanceInfo) => {
  router.push({
    name: "chat",
    params: { instanceId: instance.instanceId },
    query: { name: instance.instanceName },
  });
};

// 组件挂载时初始化
let unsubscribeCallbacks: Array<() => void> = [];
onMounted(async () => {
  // 加载用户信息
  const storedUserInfo = getUserInfo();
  if (storedUserInfo && typeof storedUserInfo === "object") {
    userInfo.value = storedUserInfo as { id: number; username: string };
  }

  // 获取当前连接状态并更新 UI
  const currentState = instanceHub.getConnectionState();
  handleConnectionStateChanged(currentState);

  // 获取当前实例列表并更新 UI
  const currentInstances = instanceHub.getInstances();
  instances.value = currentInstances;

  // 订阅事件
  unsubscribeCallbacks.push(
    instanceHub.onInstanceConnected(handleInstanceConnected)
  );
  unsubscribeCallbacks.push(
    instanceHub.onInstanceDisconnected(handleInstanceDisconnected)
  );
  unsubscribeCallbacks.push(
    instanceHub.onInstancesListUpdated(handleInstancesListUpdated)
  );
  unsubscribeCallbacks.push(
    instanceHub.onConnectionStateChanged(handleConnectionStateChanged)
  );

  // 如果未连接，则建立连接
  if (currentState === "disconnected" || currentState === "error") {
    await connectHub();
  }
});

// 组件卸载时清理
onUnmounted(() => {
  // 取消事件订阅
  unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
  unsubscribeCallbacks = [];

  // 不要断开连接，因为其他页面可能还在使用
  // disconnectHub();
});

// 页面激活时刷新数据（从其他页面返回时触发）
onActivated(async () => {
  // 回到主页时先修复连接，再同步实例缓存
  const currentState = instanceHub.getConnectionState();
  if (currentState === "disconnected" || currentState === "error") {
    await connectHub();
  }

  handleConnectionStateChanged(instanceHub.getConnectionState());
  instances.value = instanceHub.getInstances();
});
</script>
<template>
  <div class="home-container" @click="closeSettings">
    <div class="content-section">
      <!-- 头部区域：用户信息、连接状态、设置 -->
      <div class="header-section">
        <!-- 用户卡片 -->
        <div class="user-card">
          <div class="user-avatar">
            <span>{{
              userInfo?.username?.charAt(0)?.toUpperCase() || "?"
            }}</span>
          </div>
          <div class="user-details">
            <h2 class="username">
              {{ userInfo?.username || t("home.guest") || "Guest" }}
            </h2>
            <div class="user-meta">
              <span class="user-id">ID: {{ userInfo?.id || "--" }}</span>
              <div class="connection-badge" :class="connectionState">
                <Wifi v-if="connectionState === 'connected'" :size="12" />
                <WifiOff
                  v-else-if="connectionState === 'disconnected'"
                  :size="12"
                />
                <RefreshCw v-else :size="12" class="spinning" />
                <span>{{ connectionStatusText }}</span>
              </div>
            </div>
          </div>
          <!-- 刷新按钮 -->
          <button class="header-action-btn" @click="refreshPage">
            <RefreshCw :size="18" />
          </button>

          <!-- 设置按钮 - 整合到用户卡片 -->
          <button class="header-action-btn" @click="toggleSettings">
            <Settings :size="18" />
          </button>
        </div>

        <!-- PWA 安装按钮 - 放在头部右侧 -->
        <Transition name="install-button">
          <button
            v-if="showInstallButton"
            class="install-app-btn-compact"
            @click="handleInstallApp"
            :title="t('pwa.installPrompt')"
          >
            <Download :size="14" />
            <span>{{ t("pwa.installApp") }}</span>
          </button>
        </Transition>
      </div>

      <!-- 设置面板 - 下拉形式 -->
      <Transition name="settings-panel">
        <div
          v-if="showSettings"
          class="settings-panel-compact"
          @click="stopPropagation"
        >
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
            <button class="logout-btn" @click="handleLogout">
              <LogOut :size="14" />
              <span>{{ t("home.logout") || "Logout" }}</span>
            </button>
          </div>
        </div>
      </Transition>

      <!-- 连接错误提示 - 更紧凑 -->
      <div
        v-if="connectionState === 'disconnected' || connectionState === 'error'"
        class="connection-alert"
      >
        <WifiOff :size="16" />
        <span>{{ connectionStatusText }}</span>
        <button
          class="reconnect-btn"
          @click="reconnectHub"
          :disabled="isConnecting"
        >
          <RefreshCw :size="14" :class="{ spinning: isConnecting }" />
          {{
            isConnecting
              ? t("home.connecting") || "Connecting..."
              : t("home.reconnect") || "Reconnect"
          }}
        </button>
      </div>

      <!-- 实例列表 -->
      <div class="instances-section">
        <div class="section-header">
          <h3 class="section-title">
            <Monitor :size="16" />
            {{ t("home.instances") || "Connected Instances" }}
          </h3>
          <span v-if="instances.length > 0" class="instance-count">{{
            instances.length
          }}</span>
        </div>

        <div v-if="instances.length === 0" class="empty-instances">
          <div class="empty-icon">
            <Monitor :size="32" />
          </div>
          <p class="empty-title">
            {{ t("home.noInstances") || "No instances connected" }}
          </p>
          <p class="empty-hint">
            {{
              t("home.instancesHint") ||
              "Instances will appear here when connected with your user identity"
            }}
          </p>
        </div>

        <TransitionGroup
          v-else
          name="instance-list"
          tag="div"
          class="instances-grid"
        >
          <div
            v-for="instance in instances"
            :key="instance.instanceId"
            class="instance-card"
            @click="openChat(instance)"
          >
            <div class="instance-icon-wrapper">
              <Monitor :size="20" />
            </div>
            <div class="instance-info">
              <div class="instance-name-row">
                <span class="instance-name">{{ instance.instanceName }}</span>
                <span class="instance-id-short"
                  >#{{ instance.instanceId.slice(-6) }}</span
                >
              </div>
              <span class="instance-time">{{
                formatDate(instance.connectedAt)
              }}</span>
            </div>
            <div class="instance-status">
              <span class="status-dot active"></span>
              <button
                class="instance-force-offline-btn"
                type="button"
                :title="t('home.forceOffline')"
                @click="forceOfflineInstance(instance, $event)"
              >
                <Power :size="14" />
              </button>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <Transition name="modal-fade">
      <div
        v-if="showForceOfflineModal"
        class="force-offline-modal-overlay"
        @click="closeForceOfflineModal"
      >
        <div class="force-offline-modal" @click.stop>
          <div class="force-offline-modal-header">
            <h4>{{ t("home.forceOfflineConfirmTitle") }}</h4>
          </div>
          <p class="force-offline-modal-desc">
            {{
              t("home.forceOfflineConfirm", {
                name: pendingForceOfflineInstance?.instanceName || "--",
                id: pendingForceOfflineInstance?.instanceId?.slice(-6) || "--",
              })
            }}
          </p>
          <div class="force-offline-modal-actions">
            <button
              class="force-offline-modal-btn cancel"
              type="button"
              :disabled="forceOfflineSubmitting"
              @click="closeForceOfflineModal"
            >
              {{ t("home.cancel") || "Cancel" }}
            </button>
            <button
              class="force-offline-modal-btn confirm"
              type="button"
              :disabled="forceOfflineSubmitting"
              @click="confirmForceOffline"
            >
              {{
                forceOfflineSubmitting
                  ? t("home.connecting") || "Processing..."
                  : t("home.forceOfflineConfirmAction") || "Force Offline"
              }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.home-container {
  min-height: 100vh;
  padding: 1rem;
  background: radial-gradient(
      circle at 18% 28%,
      rgba(0, 0, 0, 0.03) 0.6px,
      transparent 0.7px
    ),
    radial-gradient(
      circle at 76% 72%,
      rgba(0, 0, 0, 0.028) 0.6px,
      transparent 0.7px
    ),
    var(--bg-primary);
  background-size: 3px 3px, 4px 4px, auto;
  color: var(--text-primary);
}

.content-section {
  max-width: 800px;
  margin: 0 auto;
  padding: 0;
}

/* 头部区域 */
.header-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

/* 用户卡片 - 整合信息 */
.user-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  flex: 1;
  min-width: 0;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 600;
  flex-shrink: 0;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.username {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.user-id {
  font-size: 0.6875rem;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

/* 连接状态徽章 - 仿古设计 */
.connection-badge {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  font-size: 0.6875rem;
  font-weight: 600;
  font-family: "Courier New", Courier, monospace;
  letter-spacing: 1px;
  text-transform: uppercase;
  position: relative;
}

.connection-badge::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  right: 2px;
  bottom: 2px;
  border: 1px solid var(--color-border);
  opacity: 0.3;
  pointer-events: none;
}

.connection-badge.connected {
  color: #22c55e;
  border-color: #22c55e;
}

.connection-badge.connected::before {
  border-color: #22c55e;
}

.connection-badge.disconnected {
  color: #ef4444;
  border-color: #ef4444;
}

.connection-badge.disconnected::before {
  border-color: #ef4444;
}

.connection-badge.connecting,
.connection-badge.reconnecting {
  color: #eab308;
  border-color: #eab308;
}

.connection-badge.connecting::before,
.connection-badge.reconnecting::before {
  border-color: #eab308;
}

.connection-badge.error {
  color: #ef4444;
  border-color: #ef4444;
}

.connection-badge.error::before {
  border-color: #ef4444;
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

/* 头部操作按钮（刷新、设置） */
.header-action-btn {
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.header-action-btn:hover {
  background: var(--bg-primary);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

/* 紧凑设置面板 */
.settings-panel-compact {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  margin-bottom: 1rem;
}

.settings-panel-compact .settings-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* 退出登录按钮 */
.logout-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  margin-top: 0.25rem;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
}

/* 连接错误提示 */
.connection-alert {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 5px;
  margin-bottom: 1rem;
  font-size: 0.8125rem;
  color: #ef4444;
}

.connection-alert .reconnect-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  font-size: 0.75rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.connection-alert .reconnect-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.connection-alert .reconnect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* PWA 安装按钮 - 紧凑版 */
.install-app-btn-compact {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  background: var(--color-accent);
  color: var(--color-bg);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  white-space: nowrap;
}

.install-app-btn-compact:hover {
  opacity: 0.9;
}

.install-app-btn-compact:active {
  transform: translateY(1px);
}

/* 实例列表区域 */
.instances-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 1rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.instance-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 0.125rem 0.5rem;
}

/* 空状态 */
.empty-instances {
  text-align: center;
  padding: 2rem 1rem;
}

.empty-icon {
  color: var(--text-secondary);
  opacity: 0.4;
  margin-bottom: 0.75rem;
}

.empty-title {
  margin: 0 0 0.25rem 0;
  font-size: 0.875rem;
  color: var(--text-primary);
  font-weight: 500;
}

.empty-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* 实例卡片网格 */
.instances-grid {
  display: grid;
  gap: 0.5rem;
}

.instance-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  transition: all 0.2s;
  cursor: pointer;
}

.instance-card:hover {
  border-color: var(--color-accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.instance-icon-wrapper {
  width: 36px;
  height: 36px;
  background: rgba(var(--color-accent-rgb, 99, 102, 241), 0.1);
  color: var(--color-accent);
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.instance-info {
  flex: 1;
  min-width: 0;
}

.instance-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.125rem;
}

.instance-name {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.instance-id-short {
  font-size: 0.6875rem;
  color: var(--text-secondary);
  font-family: monospace;
  flex-shrink: 0;
}

.instance-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.instance-status {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.instance-force-offline-btn {
  width: 24px;
  height: 24px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.instance-force-offline-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.65);
}

.status-dot {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 动画过渡 */
.settings-panel-enter-active,
.settings-panel-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.settings-panel-enter-from,
.settings-panel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.install-button-enter-active,
.install-button-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.install-button-enter-from,
.install-button-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.instance-list-enter-active,
.instance-list-leave-active {
  transition: all 0.25s ease;
}

.instance-list-enter-from,
.instance-list-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.instance-list-move {
  transition: transform 0.25s ease;
}

.force-offline-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.force-offline-modal {
  width: min(420px, 100%);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
  padding: 1rem;
}

.force-offline-modal-header h4 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.force-offline-modal-desc {
  margin: 0.75rem 0 1rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.force-offline-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.force-offline-modal-btn {
  min-width: 84px;
  height: 34px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.force-offline-modal-btn.cancel:hover:not(:disabled) {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.force-offline-modal-btn.confirm {
  border-color: rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.14);
  color: #ef4444;
}

.force-offline-modal-btn.confirm:hover:not(:disabled) {
  border-color: rgba(239, 68, 68, 0.7);
  background: rgba(239, 68, 68, 0.2);
}

.force-offline-modal-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* 移动端响应式 */
@media (max-width: 640px) {
  .home-container {
    padding: 0.75rem;
  }

  .header-section {
    flex-direction: column;
    align-items: stretch;
  }

  .user-card {
    width: 100%;
  }

  .install-app-btn-compact {
    width: 100%;
    justify-content: center;
  }

  .instances-section {
    padding: 0.75rem;
  }

  .instance-card {
    padding: 0.75rem;
  }
}

@media (max-width: 480px) {
  .user-avatar {
    width: 36px;
    height: 36px;
    font-size: 0.875rem;
  }

  .username {
    font-size: 0.9375rem;
  }

  .user-meta {
    gap: 0.375rem;
  }

  .connection-badge {
    font-size: 0.625rem;
    padding: 0.0625rem 0.375rem;
  }

  .instance-icon-wrapper {
    width: 32px;
    height: 32px;
  }

  .instance-name {
    font-size: 0.8125rem;
  }

  .instance-time {
    font-size: 0.6875rem;
  }
}
</style>
