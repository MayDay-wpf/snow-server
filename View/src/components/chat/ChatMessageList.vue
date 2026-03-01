<template>
  <div class="messages-area">
    <div v-if="isHistoryLoading" class="history-loading-state">
      <div class="history-loading-card">
        <div class="history-loading-spinner"></div>
        <div class="history-loading-text">
          {{ t("chat.historyListLoading") }}
        </div>
      </div>
    </div>

    <template v-else>
      <div
        v-if="messages.length === 0 && !isAssistantLoading"
        class="empty-state"
      >
        <div class="empty-text">{{ t("chat.noMessages") }}</div>
      </div>

      <div
        v-for="(message, index) in messages"
        :key="index"
        :class="['message-wrapper', message.role]"
      >
        <div class="message-header">
          <div class="role-badge" :class="message.role">
            {{ getRoleLabel(message.role) }}
          </div>
          <span class="message-time">{{ formatTime(message.timestamp) }}</span>
          <button
            v-if="message.role === 'user'"
            class="rollback-button"
            :disabled="isSessionBusy"
            @click="$emit('rollback-message', index)"
          >
            {{ t("chat.rollback") }}
          </button>
        </div>

        <div class="message-content">
          <div
            v-if="
              message.content &&
              !message.tool_call_id &&
              message.role === 'assistant'
            "
            class="text-content markdown-content"
            v-html="formatAssistantContent(message.content)"
          ></div>
          <div
            v-else-if="message.content && !message.tool_call_id"
            class="text-content plain-text-content"
          >
            {{ message.content }}
          </div>

          <div v-if="message.tool_calls?.length" class="tool-calls">
            <div
              v-for="tool in message.tool_calls"
              :key="tool.id"
              class="tool-call"
            >
              <div class="tool-header" @click="$emit('toggle-tool', tool.id)">
                <span class="tool-name">{{ tool.function.name }}</span>
                <span
                  class="tool-toggle"
                  :class="{ expanded: expandedToolIds.includes(tool.id) }"
                >
                  <ChevronRight :size="14" />
                </span>
              </div>
              <div v-show="expandedToolIds.includes(tool.id)" class="tool-body">
                <div class="section-label">参数:</div>
                <pre
                  class="code-block highlighted"
                  v-html="formatJsonHighlighted(tool.function.arguments)"
                ></pre>
              </div>
            </div>
          </div>

          <div v-if="message.tool_call_id" class="tool-result">
            <div
              class="tool-header result"
              @click="$emit('toggle-tool', message.tool_call_id)"
            >
              <span class="tool-name">{{ t("chat.toolResult") }}</span>
              <span class="tool-id">{{ message.tool_call_id.slice(-8) }}</span>
              <span
                class="tool-toggle"
                :class="{
                  expanded: expandedToolIds.includes(message.tool_call_id),
                }"
              >
                <ChevronRight :size="14" />
              </span>
            </div>
            <div
              v-show="expandedToolIds.includes(message.tool_call_id)"
              class="tool-body"
            >
              <!-- 文件编辑/创建结果 - 使用代码差异组件 -->
              <CodeDiffViewer
                v-if="isFilesystemEditResult(message.content)"
                :file-path="getEditResult(message.content).filePath || ''"
                :old-content="getEditResult(message.content).oldContent"
                :new-content="getEditResult(message.content).newContent || ''"
                :line-info="getEditResult(message.content).lineInfo"
                :t="t"
              />

              <!-- 文件创建结果 -->
              <CodeDiffViewer
                v-else-if="isCreateFileResult(message.content)"
                :is-create-file="true"
                :file-path="getCreateFilePath(message.content)"
                :content="message.content"
                :t="t"
              />

              <!-- TODO 工具结果 -->
              <TodoResultViewer
                v-else-if="isTodoResult(message.content)"
                :data="getTodoData(message.content)"
                :operation="getTodoOperation(message.content)"
                :t="t"
              />

              <!-- 默认 JSON 显示 -->
              <pre
                v-else
                class="code-block highlighted"
                v-html="formatJsonHighlighted(message.content)"
              ></pre>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="isAssistantLoading"
        class="message-wrapper assistant loading-wrapper"
      >
        <div class="message-header">
          <div class="role-badge assistant">{{ t("chat.roleAssistant") }}</div>
        </div>
        <div class="message-content loading-content">
          {{ t("chat.thinking") }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";
import hljs from "highlight.js/lib/core";
import hljsDarkCssUrl from "highlight.js/styles/github-dark.css?url";
import hljsLightCssUrl from "highlight.js/styles/github.css?url";
import json from "highlight.js/lib/languages/json";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import MarkdownIt from "markdown-it";
import { onBeforeUnmount, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import CodeDiffViewer from "./CodeDiffViewer.vue";
import TodoResultViewer from "./TodoResultViewer.vue";

const { t } = useI18n();

hljs.registerLanguage("json", json);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);

const hljsThemeStyleId = "chat-message-hljs-theme";
let hljsThemeObserver: MutationObserver | null = null;

const syncHighlightTheme = () => {
  if (typeof document === "undefined") return;

  const theme = document.documentElement.getAttribute("data-theme");
  const href = theme === "dark" ? hljsDarkCssUrl : hljsLightCssUrl;
  let link = document.getElementById(
    hljsThemeStyleId
  ) as HTMLLinkElement | null;

  if (!link) {
    link = document.createElement("link");
    link.id = hljsThemeStyleId;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }

  if (link.href !== href) {
    link.href = href;
  }
};

onMounted(() => {
  syncHighlightTheme();

  hljsThemeObserver = new MutationObserver(() => {
    syncHighlightTheme();
  });
  hljsThemeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
});

onBeforeUnmount(() => {
  hljsThemeObserver?.disconnect();
  hljsThemeObserver = null;
});

const highlightCode = (code: string, language?: string) => {
  if (!code) return "";

  const normalizedLang = (language || "").toLowerCase();
  if (normalizedLang && hljs.getLanguage(normalizedLang)) {
    return hljs.highlight(code, {
      language: normalizedLang,
      ignoreIllegals: true,
    }).value;
  }

  return hljs.highlightAuto(code, ["json", "javascript", "typescript", "xml"])
    .value;
};

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

const props = defineProps<{
  messages: MessageItem[];
  expandedToolIds: string[];
  isAssistantLoading: boolean;
  isHistoryLoading: boolean;
  isSessionBusy: boolean;
}>();
defineEmits<{
  (e: "toggle-tool", toolId: string): void;
  (e: "rollback-message", messageIndex: number): void;
}>();

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true,
  highlight: (code: string, language: string) => {
    const languageClass = language ? ` language-${language}` : "";
    const highlighted = highlightCode(code, language);
    return `<pre class="hljs"><code class="hljs${languageClass}">${highlighted}</code></pre>`;
  },
});

watch(
  () => props.messages,
  () => {
    // 移除此处的自动滚动，由父组件控制
  },
  { deep: true }
);

const formatTime = (timestamp: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    user: t("chat.roleUser"),
    assistant: t("chat.roleAssistant"),
    tool: t("chat.roleTool"),
  };
  return labels[role] || role;
};

const formatAssistantContent = (content: string) => {
  if (!content) return "";
  return markdown.render(content);
};

const formatJsonHighlighted = (data: string | object) => {
  try {
    const obj = typeof data === "string" ? JSON.parse(data) : data;
    return hljs.highlight(JSON.stringify(obj, null, 2), {
      language: "json",
      ignoreIllegals: true,
    }).value;
  } catch {
    return hljs.highlightAuto(String(data), [
      "json",
      "javascript",
      "typescript",
    ]).value;
  }
};

// 检测是否为文件编辑结果
const isFilesystemEditResult = (content: string): boolean => {
  try {
    const obj = JSON.parse(content);
    return (
      obj &&
      typeof obj === "object" &&
      (obj.oldContent !== undefined || obj.newContent !== undefined) &&
      obj.filePath !== undefined &&
      !obj.isCreateFile
    );
  } catch {
    // 检查字符串格式的编辑结果
    return (
      content.includes("File edited successfully") &&
      (content.includes("oldContent") || content.includes("newContent"))
    );
  }
};

// 解析编辑结果
const getEditResult = (
  content: string
): {
  filePath?: string;
  oldContent?: string;
  newContent?: string;
  lineInfo?: string;
} => {
  try {
    const obj = JSON.parse(content);
    return {
      filePath: obj.filePath,
      oldContent: obj.oldContent,
      newContent: obj.newContent,
      lineInfo: obj.matchLocation
        ? `lines ${obj.matchLocation.startLine}-${obj.matchLocation.endLine}`
        : obj.contextStartLine
        ? `context ${obj.contextStartLine}-${obj.contextEndLine}`
        : undefined,
    };
  } catch {
    return {};
  }
};

// 检测是否为文件创建结果
const isCreateFileResult = (content: string): boolean => {
  return content.includes("File created successfully");
};

// 获取创建文件的路径
const getCreateFilePath = (content: string): string => {
  const match = content.match(/File created successfully:\s*(.+)/);
  return match?.[1]?.trim() || "";
};

// 检测是否为 TODO 结果
const isTodoResult = (content: string): boolean => {
  try {
    const obj = JSON.parse(content);
    return (
      obj &&
      typeof obj === "object" &&
      obj.sessionId !== undefined &&
      Array.isArray(obj.todos)
    );
  } catch {
    return false;
  }
};

// 获取 TODO 数据
const getTodoData = (content: string) => {
  try {
    return JSON.parse(content);
  } catch {
    return { todos: [] };
  }
};

// 获取 TODO 操作类型
const getTodoOperation = (
  content: string
): "get" | "add" | "update" | "delete" | undefined => {
  // 根据内容特征判断操作类型
  if (content.includes("todoAdded")) return "add";
  if (content.includes("todoUpdated")) return "update";
  if (content.includes("todoDeleted")) return "delete";
  return undefined;
};
</script>

<style scoped>
.messages-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 1rem 0;
  box-sizing: border-box;
}
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
}
.history-loading-state {
  flex: 1;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.history-loading-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 13px;
}
.history-loading-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  border-top-color: var(--color-accent);
  animation: history-loading-spin 0.8s linear infinite;
}
.history-loading-text {
  white-space: nowrap;
}
@keyframes history-loading-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.message-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 85%;
}
.message-wrapper.user {
  align-self: flex-end;
}
.message-wrapper.assistant,
.message-wrapper.tool {
  align-self: flex-start;
}
.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  padding: 0 4px;
}
.role-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}
.role-badge.user {
  background-color: var(--color-accent);
  color: var(--color-bg);
}
.role-badge.assistant {
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}
.role-badge.tool {
  background-color: var(--text-secondary);
  color: var(--color-bg);
}
.message-time {
  font-size: 12px;
  color: var(--text-secondary);
}
.rollback-button {
  font-size: 11px;
  padding: 2px 8px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}
.message-wrapper:hover .rollback-button {
  opacity: 1;
}
.rollback-button:hover {
  background: var(--bg-primary);
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.rollback-button:disabled,
.message-wrapper:hover .rollback-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.rollback-button:disabled:hover {
  background: transparent;
  border-color: var(--border-color);
  color: var(--text-secondary);
}
.message-content {
  padding: 14px 18px;
  border-radius: 5px;
  font-size: 14px;
  line-height: 1.6;
}
.message-wrapper.user .message-content {
  background-color: var(--color-accent);
  color: var(--color-bg);
  border-bottom-right-radius: 4px;
}
.message-wrapper.assistant .message-content {
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--text-primary);
}
.message-wrapper.tool .message-content {
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--text-primary);
}
.text-content {
  word-wrap: break-word;
}
.plain-text-content {
  white-space: pre-wrap;
}
.markdown-content :deep(p) {
  margin: 0 0 8px;
}
.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}
.markdown-content :deep(code) {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}
.markdown-content :deep(pre) {
  margin: 8px 0;
  padding: 10px;
  background: var(--bg-code, #1e1e1e);
  color: var(--text-code, #d4d4d4);
  border-radius: 6px;
  overflow-x: auto;
}
.loading-wrapper {
  opacity: 0.9;
}
.loading-content {
  padding: 0;
  color: var(--text-secondary);
}
.tool-calls,
.tool-result {
  margin-top: 12px;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}
.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background-color: var(--bg-secondary);
  cursor: pointer;
  user-select: none;
}
.tool-header.result {
  background-color: rgba(var(--color-accent-rgb, 99, 102, 241), 0.1);
}
.tool-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.tool-id {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: monospace;
}
.tool-toggle {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: transform 0.2s ease;
}
.tool-toggle.expanded {
  transform: rotate(90deg);
}
.tool-body {
  padding: 14px;
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
}
.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.code-block {
  margin: 0;
  padding: 12px;
  background-color: var(--bg-code);
  color: var(--text-code);
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  white-space: pre-wrap;
}
.code-block.highlighted {
  overflow-x: auto;
}
.tool-body .code-block.highlighted {
  background-color: var(--bg-primary) !important;
  color: var(--text-primary) !important;
}
:global([data-theme="dark"]) .tool-body .code-block.highlighted {
  background-color: #0d1117 !important;
  color: #c9d1d9 !important;
}
.markdown-content :deep(pre.hljs),
.code-block.highlighted {
  border-radius: 6px;
}
.markdown-content :deep(pre.hljs) {
  background: transparent;
  padding: 0;
}
</style>
