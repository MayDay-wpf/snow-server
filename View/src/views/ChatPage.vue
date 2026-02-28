<template>
  <div class="chat-page" @click="closeSettings">
    <ChatHeader
      :session-title="sessionTitle"
      :instance-name="instanceName"
      :message-count="messageCount"
      :back-text="t('chat.back')"
      :new-session-text="t('chat.newSession')"
      :message-count-text="t('chat.messageCount')"
      :settings-title="t('settings.title')"
      :history-title="t('chat.historyListTitle')"
      @go-back="goBack"
      @create-new-session="createNewSession"
      @toggle-settings="toggleSettings"
      @toggle-history-list="toggleHistoryList"
    />

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
        </div>
      </div>
    </Transition>

    <Transition name="history-drawer">
      <div
        v-if="sessionListState.visible"
        class="history-drawer-backdrop"
        @click="closeHistoryDrawer"
      >
        <aside class="history-drawer" @click="stopPropagation">
          <div class="history-drawer-header">
            <div class="card-title">{{ t("chat.historyListTitle") }}</div>
            <button
              class="history-drawer-close-btn"
              type="button"
              :title="t('chat.close')"
              @click="closeHistoryDrawer"
            >
              <X :size="16" />
            </button>
          </div>

          <input
            v-model="sessionListState.searchQuery"
            class="history-search-input"
            type="text"
            :placeholder="t('chat.historyListSearchPlaceholder')"
            @keyup.enter="searchSessionList"
          />
          <button
            class="history-search-btn"
            type="button"
            :disabled="sessionListState.loading"
            @click="searchSessionList"
          >
            {{ t("chat.historyListSearchBtn") }}
          </button>

          <div v-if="sessionListState.loading" class="card-text">
            {{ t("chat.historyListLoading") }}
          </div>
          <div v-else-if="sessionListState.error" class="card-text">
            {{ sessionListState.error }}
          </div>
          <div v-else-if="!sessionListState.sessions.length" class="card-text">
            {{ t("chat.historyListEmpty") }}
          </div>
          <div v-else class="history-list-wrap">
            <button
              v-for="session in sessionListState.sessions"
              :key="session.id"
              class="history-item-btn"
              type="button"
              :title="session.id"
              @click="resumeSessionById(session.id)"
            >
              <span class="history-item-title">{{
                session.title || session.id
              }}</span>
              <span class="history-item-meta"
                >{{ formatSessionUpdatedAt(session.updatedAt) }} ·
                {{ session.messageCount }} {{ t("chat.messageCount") }}</span
              >
            </button>
            <button
              v-if="sessionListState.hasMore"
              class="history-load-more-btn"
              type="button"
              :disabled="sessionListState.loadingMore"
              @click="loadMoreSessionList"
            >
              {{
                sessionListState.loadingMore
                  ? t("chat.historyListLoading")
                  : t("chat.historyListLoadMore")
              }}
            </button>
          </div>
        </aside>
      </div>
    </Transition>

    <ChatMessagePanel
      :parsed-messages="parsedMessages"
      :expanded-tool-ids="expandedToolIds"
      :is-assistant-loading="isAssistantLoading"
      :pending-tool-confirmations="pendingToolConfirmations"
      :pending-questions="pendingQuestions"
      :pending-rollback-confirmation="pendingRollbackConfirmation"
      :file-picker-state="filePickerState"
      :file-picker-query="filePickerQuery"
      :filtered-file-options="filteredFileOptions"
      :input-message="inputMessage"
      :t="t"
      :format-json="formatJson"
      @toggle-tool="toggleTool"
      @rollback-message="rollbackMessageByIndex"
      @submit-tool-confirmation="submitToolConfirmation"
      @toggle-question-option="toggleQuestionOption"
      @submit-question="submitQuestion"
      @cancel-question="cancelQuestion"
      @submit-rollback-confirmation="submitRollbackConfirmation"
      @close-file-picker="closeFilePicker"
      @append-selected-file-to-input="appendSelectedFileToInput"
      @send="sendMessage"
      @interrupt="interruptMessageProcessing"
      @request-file-list="openFileListPicker"
      @update:inputMessage="inputMessage = $event"
      @update:filePickerQuery="filePickerQuery = $event"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import ChatHeader from "../components/chat/ChatHeader.vue";
import ChatMessagePanel from "../components/chat/ChatMessagePanel.vue";
import { instanceHub } from "../api/instanceHub";
import Select from "../components/Select.vue";
import {
  useTheme,
  setThemeMode,
  type ThemeMode,
} from "../composables/useTheme";
import { setLocale, getLocale } from "../locales";
import { X } from "lucide-vue-next";

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface MessageItem {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface SessionData {
  sessionTitle?: string;
  messageCount?: number;
  messages?: MessageItem[];
}

interface PendingToolConfirmation {
  toolName: string;
  toolArguments: string;
  toolCallId: string;
}

interface PendingQuestion {
  question: string;
  options: string[];
  toolCallId: string;
  selectedOptions: string[];
  customInput: string;
}
interface PendingRollbackConfirmation {
  filePaths: string[];
  notebookCount: number;
}

interface FilePickerState {
  visible: boolean;
  requestId: string;
  loading: boolean;
  files: string[];
  error: string;
}

interface InstanceSessionSummary {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

interface SessionListState {
  visible: boolean;
  requestId: string;
  loading: boolean;
  loadingMore: boolean;
  sessions: InstanceSessionSummary[];
  error: string;
  searchQuery: string;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { currentMode } = useTheme();

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

const SESSION_LIST_PAGE_SIZE = 20;

const closeHistoryDrawer = () => {
  sessionListState.value.visible = false;
};

const normalizeSessionUpdatedAt = (updatedAt: number) => {
  // 兼容秒级时间戳（10位）和毫秒时间戳（13位）
  return updatedAt < 1_000_000_000_000 ? updatedAt * 1000 : updatedAt;
};

const formatSessionUpdatedAt = (updatedAt: number) => {
  const date = new Date(normalizeSessionUpdatedAt(updatedAt));
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
};

const requestSessionList = async (options?: { append?: boolean }) => {
  const append = options?.append ?? false;
  await ensureHubConnected();

  const nextPage = append ? sessionListState.value.page + 1 : 0;
  const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  sessionListState.value = {
    ...sessionListState.value,
    visible: true,
    requestId,
    loading: !append,
    loadingMore: append,
    sessions: append ? sessionListState.value.sessions : [],
    error: "",
    page: nextPage,
  };

  await instanceHub.requestSessionList(instanceId.value, requestId, {
    page: nextPage,
    pageSize: sessionListState.value.pageSize,
    searchQuery: sessionListState.value.searchQuery,
  });
};

const searchSessionList = async () => {
  try {
    await requestSessionList({ append: false });
  } catch {
    sessionListState.value = {
      ...sessionListState.value,
      visible: true,
      loading: false,
      loadingMore: false,
      sessions: [],
      error: t("chat.historyListRequestFailed"),
      total: 0,
      hasMore: false,
    };
  }
};

const loadMoreSessionList = async () => {
  if (
    sessionListState.value.loading ||
    sessionListState.value.loadingMore ||
    !sessionListState.value.hasMore
  ) {
    return;
  }
  try {
    await requestSessionList({ append: true });
  } catch {
    sessionListState.value = {
      ...sessionListState.value,
      loadingMore: false,
      error: t("chat.historyListRequestFailed"),
    };
  }
};

const toggleHistoryList = async (event?: Event) => {
  event?.stopPropagation();
  if (sessionListState.value.visible) {
    closeHistoryDrawer();
    return;
  }
  await searchSessionList();
};

const resumeSessionById = async (sessionId: string) => {
  try {
    await ensureHubConnected();
    await instanceHub.sendResumeSession(instanceId.value, sessionId);
    closeHistoryDrawer();
  } catch {
    addAssistantText(t("chat.historyResumeFailed"));
  }
};

// 阻止事件冒泡
const stopPropagation = (event: Event) => {
  event.stopPropagation();
};

const instanceId = ref("");
const instanceName = ref(t("chat.defaultInstanceName"));
const inputMessage = ref("");
const sessionData = ref<SessionData | null>(null);
const expandedTools = ref<Set<string>>(new Set());
const pendingToolConfirmations = ref<PendingToolConfirmation[]>([]);
const pendingQuestions = ref<PendingQuestion[]>([]);
const pendingRollbackConfirmation = ref<PendingRollbackConfirmation | null>(
  null
);
const filePickerState = ref<FilePickerState>({
  visible: false,
  requestId: "",
  loading: false,
  files: [],
  error: "",
});
const filePickerQuery = ref("");
const sessionListState = ref<SessionListState>({
  visible: false,
  requestId: "",
  loading: false,
  loadingMore: false,
  sessions: [],
  error: "",
  searchQuery: "",
  page: 0,
  pageSize: SESSION_LIST_PAGE_SIZE,
  total: 0,
  hasMore: false,
});
const suppressAtTriggerOnce = ref(false);
const isAssistantLoading = ref(false);

const parsedMessages = computed(() => sessionData.value?.messages || []);
const filteredFileOptions = computed(() => {
  const keyword = filePickerQuery.value.trim().toLowerCase();
  if (!keyword) {
    return filePickerState.value.files;
  }

  return filePickerState.value.files.filter((file) =>
    file.toLowerCase().includes(keyword)
  );
});
const sessionTitle = computed(() => sessionData.value?.sessionTitle);
const messageCount = computed(
  () =>
    sessionData.value?.messageCount || sessionData.value?.messages?.length || 0
);
const expandedToolIds = computed(() => Array.from(expandedTools.value));

const initInstanceInfo = () => {
  const nextId = route.params.instanceId as string;
  const nextName = (route.query.name as string) || "实例对话";
  if (instanceId.value !== nextId) {
    instanceId.value = nextId;
    instanceName.value = nextName;
    sessionData.value = null;
    pendingToolConfirmations.value = [];
    pendingQuestions.value = [];
    pendingRollbackConfirmation.value = null;
    isAssistantLoading.value = false;
  }
};

const goBack = () => router.push({ name: "home" });

const addAssistantText = (content: string) => {
  if (!sessionData.value) {
    sessionData.value = { messages: [] };
  }
  sessionData.value.messages = [
    ...(sessionData.value.messages || []),
    {
      role: "assistant",
      content,
      timestamp: Date.now(),
    },
  ];
};

const parseContextInfo = (data: string) => {
  try {
    const jsonMatch = data.match(/(\{[\s\S]*\})/);
    const jsonText = jsonMatch?.[1];
    if (!jsonText) return null;
    return JSON.parse(jsonText) as SessionData;
  } catch {
    return null;
  }
};

const waitForConnection = (timeout: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (instanceHub.getConnectionState() === "connected") {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(new Error("连接超时"));
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  });
};

const ensureHubConnected = async () => {
  const state = instanceHub.getConnectionState();
  if (state === "disconnected" || state === "error") {
    await instanceHub.connect();
    return;
  }
  if (state !== "connected") {
    await waitForConnection(10000);
  }
};

const requestContextInfo = async () => {
  await ensureHubConnected();
  await instanceHub.requestContextInfo(instanceId.value);
};

const sendMessage = async () => {
  if (isAssistantLoading.value || !inputMessage.value.trim()) return;

  const content = inputMessage.value;
  inputMessage.value = "";
  if (!sessionData.value) {
    sessionData.value = { messages: [] };
  }
  sessionData.value.messages = [
    ...(sessionData.value.messages || []),
    { role: "user", content, timestamp: Date.now() },
  ];

  isAssistantLoading.value = true;
  try {
    await instanceHub.sendMessageToInstance(instanceId.value, content);
  } catch {
    isAssistantLoading.value = false;
    addAssistantText("消息发送失败，请检查连接");
  }
};

const interruptMessageProcessing = async () => {
  if (!isAssistantLoading.value) return;
  try {
    await instanceHub.sendInterruptMessageProcessing(instanceId.value);
    isAssistantLoading.value = false;
  } catch {
    addAssistantText("中断请求发送失败，请检查连接");
  }
};

const createNewSession = async () => {
  try {
    await ensureHubConnected();
    await instanceHub.sendClearSession(instanceId.value);
    sessionData.value = { messages: [] };
    pendingToolConfirmations.value = [];
    pendingQuestions.value = [];
    pendingRollbackConfirmation.value = null;
    isAssistantLoading.value = false;
  } catch {
    addAssistantText("新建会话请求失败，请检查连接");
  }
};

const rollbackMessageByIndex = async (messageIndex: number) => {
  const messages = parsedMessages.value;
  if (!messages[messageIndex] || messages[messageIndex].role !== "user") {
    return;
  }

  const userMessageOrder = messages
    .slice(0, messageIndex + 1)
    .filter((x) => x.role === "user").length;

  try {
    await ensureHubConnected();
    await instanceHub.sendRollbackMessage(instanceId.value, userMessageOrder);
  } catch {
    addAssistantText("消息回滚请求失败，请检查连接");
  }
};

const toggleTool = (id: string) => {
  if (expandedTools.value.has(id)) expandedTools.value.delete(id);
  else expandedTools.value.add(id);
};

const formatJson = (data: string | object) => {
  try {
    const obj = typeof data === "string" ? JSON.parse(data) : data;
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(data);
  }
};

const submitToolConfirmation = async (
  toolCallId: string,
  result: "approve" | "approve_always" | "reject"
) => {
  await instanceHub.sendToolConfirmationResult(
    instanceId.value,
    toolCallId,
    result
  );
  pendingToolConfirmations.value = pendingToolConfirmations.value.filter(
    (x) => x.toolCallId !== toolCallId
  );
};

const toggleQuestionOption = (toolCallId: string, option: string) => {
  const item = pendingQuestions.value.find((x) => x.toolCallId === toolCallId);
  if (!item) return;
  if (item.selectedOptions.includes(option)) {
    item.selectedOptions = item.selectedOptions.filter((x) => x !== option);
  } else {
    item.selectedOptions = [...item.selectedOptions, option];
  }
};

const submitQuestion = async (item: PendingQuestion) => {
  await instanceHub.sendUserQuestionResult(
    instanceId.value,
    item.toolCallId,
    item.selectedOptions,
    item.customInput || undefined,
    false
  );
  pendingQuestions.value = pendingQuestions.value.filter(
    (x) => x.toolCallId !== item.toolCallId
  );
};

const cancelQuestion = async (toolCallId: string) => {
  await instanceHub.sendUserQuestionResult(
    instanceId.value,
    toolCallId,
    [],
    undefined,
    true
  );
  pendingQuestions.value = pendingQuestions.value.filter(
    (x) => x.toolCallId !== toolCallId
  );
};

const submitRollbackConfirmation = async (
  rollbackFiles: boolean | null,
  selectedFiles?: string[]
) => {
  try {
    await instanceHub.sendRollbackConfirmationResult(
      instanceId.value,
      rollbackFiles,
      selectedFiles
    );
    pendingRollbackConfirmation.value = null;
  } catch {
    addAssistantText("回滚确认提交失败，请检查连接");
  }
};

const closeFilePicker = () => {
  filePickerState.value.visible = false;
  filePickerQuery.value = "";
};

const appendSelectedFileToInput = (filePath: string) => {
  const currentInput = inputMessage.value;
  const hasTrailingAt = /(^|\s)@$/.test(currentInput);

  suppressAtTriggerOnce.value = true;
  if (hasTrailingAt) {
    inputMessage.value = currentInput.replace(/@$/, `@${filePath}`);
  } else {
    const prefix = currentInput.trim().length > 0 ? " " : "";
    inputMessage.value = `${currentInput}${prefix}@${filePath}`;
  }

  closeFilePicker();
};

const openFileListPicker = async () => {
  filePickerQuery.value = "";
  try {
    await ensureHubConnected();
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    filePickerState.value = {
      visible: true,
      requestId,
      loading: true,
      files: [],
      error: "",
    };
    await instanceHub.requestFileList(instanceId.value, requestId);
  } catch {
    filePickerState.value = {
      visible: true,
      requestId: "",
      loading: false,
      files: [],
      error: t("chat.fileListRequestFailed"),
    };
  }
};

watch(inputMessage, (newValue, oldValue) => {
  if (suppressAtTriggerOnce.value) {
    suppressAtTriggerOnce.value = false;
    return;
  }

  if (filePickerState.value.visible) {
    return;
  }

  const isSingleAtInput =
    newValue.length === oldValue.length + 1 &&
    newValue.endsWith("@") &&
    !oldValue.endsWith("@");

  if (isSingleAtInput) {
    void openFileListPicker();
  }
});

let unsubContext: (() => void) | null = null;
let unsubReply: (() => void) | null = null;
let unsubProcessingCompleted: (() => void) | null = null;
let unsubToolConfirm: (() => void) | null = null;
let unsubQuestion: (() => void) | null = null;
let unsubRollbackConfirm: (() => void) | null = null;
let unsubFileList: (() => void) | null = null;
let unsubSessionList: (() => void) | null = null;

const setupListeners = () => {
  unsubContext?.();
  unsubReply?.();
  unsubProcessingCompleted?.();
  unsubToolConfirm?.();
  unsubQuestion?.();
  unsubRollbackConfirm?.();
  unsubFileList?.();
  unsubSessionList?.();

  unsubContext = instanceHub.onContextInfoReceived(
    (receivedInstanceId, data) => {
      if (receivedInstanceId !== instanceId.value) return;
      const parsed = parseContextInfo(data);
      if (parsed) sessionData.value = parsed;
    }
  );

  unsubReply = instanceHub.onMessageReplyReceived(
    (receivedInstanceId, replyMessage) => {
      if (receivedInstanceId !== instanceId.value) return;
      isAssistantLoading.value = false;
      const parsed = parseContextInfo(replyMessage);
      if (parsed?.messages) sessionData.value = parsed;
      else addAssistantText(replyMessage);
    }
  );

  unsubProcessingCompleted = instanceHub.onMessageProcessingCompleted(
    (receivedInstanceId) => {
      if (receivedInstanceId !== instanceId.value) return;
      isAssistantLoading.value = false;
    }
  );

  unsubToolConfirm = instanceHub.onToolConfirmationNeeded((payload) => {
    if (payload.instanceId !== instanceId.value) return;
    pendingToolConfirmations.value = [
      ...pendingToolConfirmations.value.filter(
        (x) => x.toolCallId !== payload.toolCallId
      ),
      {
        toolName: payload.toolName,
        toolArguments: payload.toolArguments,
        toolCallId: payload.toolCallId,
      },
    ];
  });

  unsubQuestion = instanceHub.onUserInteractionNeeded((payload) => {
    if (payload.instanceId !== instanceId.value) return;
    let options: string[] = [];
    try {
      options = JSON.parse(payload.optionsJson) as string[];
    } catch {
      options = [payload.optionsJson];
    }
    pendingQuestions.value = [
      ...pendingQuestions.value.filter(
        (x) => x.toolCallId !== payload.toolCallId
      ),
      {
        question: payload.question,
        options,
        toolCallId: payload.toolCallId,
        selectedOptions: [],
        customInput: "",
      },
    ];
  });

  unsubRollbackConfirm = instanceHub.onRollbackConfirmationNeeded((payload) => {
    if (payload.instanceId !== instanceId.value) return;
    let filePaths: string[] = [];
    try {
      const parsed = JSON.parse(payload.filePathsJson);
      filePaths = Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      filePaths = [];
    }

    pendingRollbackConfirmation.value = {
      filePaths,
      notebookCount: payload.notebookCount || 0,
    };
  });

  unsubFileList = instanceHub.onFileListReceived((payload) => {
    if (payload.instanceId !== instanceId.value) return;
    if (payload.requestId !== filePickerState.value.requestId) return;

    let files: string[] = [];
    try {
      const parsed = JSON.parse(payload.fileListJson);
      files = Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      files = [];
    }

    filePickerState.value = {
      ...filePickerState.value,
      loading: false,
      files,
      error: files.length ? "" : t("chat.fileListEmpty"),
    };
  });

  unsubSessionList = instanceHub.onSessionListReceived((payload) => {
    if (payload.instanceId !== instanceId.value) return;
    if (payload.requestId !== sessionListState.value.requestId) return;

    let sessions: InstanceSessionSummary[] = [];
    let total = 0;
    let hasMore = false;

    try {
      const parsed = JSON.parse(payload.sessionListJson) as unknown;
      const toSessionList = (items: unknown[]): InstanceSessionSummary[] =>
        items
          .filter(
            (x): x is Record<string, unknown> =>
              typeof x === "object" &&
              x !== null &&
              typeof (x as { id?: unknown }).id === "string"
          )
          .map((x) => ({
            id: x.id as string,
            title: typeof x.title === "string" ? x.title : "",
            updatedAt:
              typeof x.updatedAt === "number" ? x.updatedAt : Date.now(),
            messageCount:
              typeof x.messageCount === "number" ? x.messageCount : 0,
          }));

      if (Array.isArray(parsed)) {
        sessions = toSessionList(parsed);
        total = sessions.length;
        hasMore = false;
      } else if (
        typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as { sessions?: unknown }).sessions)
      ) {
        const result = parsed as {
          sessions: unknown[];
          total?: number;
          hasMore?: boolean;
        };
        sessions = toSessionList(result.sessions);
        total =
          typeof result.total === "number" ? result.total : sessions.length;
        hasMore = Boolean(result.hasMore);
      }
    } catch {
      sessions = [];
      total = 0;
      hasMore = false;
    }

    sessionListState.value = {
      ...sessionListState.value,
      loading: false,
      loadingMore: false,
      sessions:
        sessionListState.value.page > 0
          ? [...sessionListState.value.sessions, ...sessions]
          : sessions,
      total,
      hasMore,
      error:
        sessions.length || sessionListState.value.page > 0
          ? ""
          : t("chat.historyListEmpty"),
    };
  });
};

onMounted(async () => {
  initInstanceInfo();
  setupListeners();
  await requestContextInfo();
});

onActivated(async () => {
  initInstanceInfo();
  setupListeners();
  await requestContextInfo();
});

onDeactivated(() => {
  unsubContext?.();
  unsubReply?.();
  unsubProcessingCompleted?.();
  unsubToolConfirm?.();
  unsubQuestion?.();
  unsubRollbackConfirm?.();
  unsubFileList?.();
  unsubSessionList?.();
});

onUnmounted(() => {
  unsubContext?.();
  unsubReply?.();
  unsubProcessingCompleted?.();
  unsubToolConfirm?.();
  unsubQuestion?.();
  unsubRollbackConfirm?.();
  unsubFileList?.();
  unsubSessionList?.();
});
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: radial-gradient(
      circle at 20% 30%,
      rgba(0, 0, 0, 0.035) 0.6px,
      transparent 0.7px
    ),
    radial-gradient(
      circle at 80% 70%,
      rgba(0, 0, 0, 0.03) 0.6px,
      transparent 0.7px
    ),
    var(--bg-primary);
  background-size: 3px 3px, 4px 4px, auto;
  color: var(--text-primary);
  position: relative;
}

.history-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 160;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: flex-start;
}

.history-drawer {
  width: min(380px, 86vw);
  height: 100%;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  box-sizing: border-box;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.history-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.history-drawer-close-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.history-drawer-close-btn:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.history-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.8125rem;
}

.history-search-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.history-search-btn,
.history-load-more-btn {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 0.5rem 0.625rem;
  cursor: pointer;
}

.history-search-btn:disabled,
.history-load-more-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.history-list-wrap {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.history-item-btn {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 0.5rem 0.625rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.history-item-btn:hover {
  border-color: var(--color-accent);
}

.history-item-title {
  font-size: 0.8125rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.history-drawer-enter-active,
.history-drawer-leave-active {
  transition: opacity 0.2s ease;
}

.history-drawer-enter-from,
.history-drawer-leave-to {
  opacity: 0;
}

.settings-panel-compact {
  position: absolute;
  top: 60px;
  right: 1rem;
  width: 280px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.settings-panel-compact .settings-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* 设置面板过渡动画 */
.settings-panel-enter-active,
.settings-panel-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.settings-panel-enter-from,
.settings-panel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* 移动端响应式 */
@media (max-width: 640px) {
  .settings-panel-compact {
    right: 0.5rem;
    left: 0.5rem;
    width: auto;
  }

  .interaction-card {
    min-width: 280px;
  }
}
</style>
