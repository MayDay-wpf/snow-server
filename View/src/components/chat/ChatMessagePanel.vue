<template>
  <div class="chat-container">
    <div ref="messagesWrapperRef" class="messages-wrapper">
      <div class="messages-container">
        <ChatMessageList
          :messages="parsedMessages"
          :expanded-tool-ids="expandedToolIds"
          :is-assistant-loading="isAssistantLoading"
          :is-history-loading="isHistoryLoading"
          :is-session-busy="isSessionBusy"
          @toggle-tool="emit('toggle-tool', $event)"
          @rollback-message="emit('rollback-message', $event)"
        />
      </div>
    </div>

    <Transition name="scroll-btn">
      <button
        v-show="showScrollButton"
        class="scroll-to-bottom-btn"
        @click="scrollToBottom"
        :title="t('chat.scrollToBottom')"
      >
        <ChevronDown :size="20" />
      </button>
    </Transition>

    <div
      v-if="
        pendingToolConfirmations.length ||
        pendingQuestions.length ||
        pendingRollbackConfirmation
      "
      class="interaction-panel"
    >
      <ToolConfirmation
        v-for="item in pendingToolConfirmations"
        :key="item.toolCallId"
        :tool-name="item.toolName"
        :tool-arguments="item.toolArguments"
        :t="t"
        :format-json="formatJson"
        @approve="emit('submit-tool-confirmation', item.toolCallId, 'approve')"
        @approve-always="
          emit('submit-tool-confirmation', item.toolCallId, 'approve_always')
        "
        @reject="emit('submit-tool-confirmation', item.toolCallId, 'reject')"
        @reject-with-reply="
          emit(
            'submit-tool-confirmation',
            item.toolCallId,
            'reject_with_reply',
            $event
          )
        "
      />

      <QuestionDialog
        v-for="item in pendingQuestions"
        :key="item.toolCallId"
        :question="item.question"
        :options="item.options"
        :tool-call-id="item.toolCallId"
        :selected-options="item.selectedOptions"
        :custom-input="item.customInput"
        :t="t"
        @toggle-option="emit('toggle-question-option', item.toolCallId, $event)"
        @submit="emit('submit-question', $event)"
        @cancel="emit('cancel-question', item.toolCallId)"
      />

      <RollbackConfirmation
        v-if="pendingRollbackConfirmation"
        :file-paths="pendingRollbackConfirmation.filePaths"
        :notebook-count="pendingRollbackConfirmation.notebookCount"
        :t="t"
        @confirm-rollback-files="emit('submit-rollback-confirmation', true)"
        @confirm-rollback-session="emit('submit-rollback-confirmation', false)"
        @cancel="emit('submit-rollback-confirmation', null)"
      />
    </div>

    <FilePickerDialog
      v-if="filePickerState.visible"
      :visible="filePickerState.visible"
      :loading="filePickerState.loading"
      :files="filteredFileOptions"
      :error="filePickerState.error"
      :query="filePickerQuery"
      :t="t"
      @close="emit('close-file-picker')"
      @update:query="emit('update:filePickerQuery', $event)"
      @select="handleFileSelect"
    />

    <ChatInput
      ref="chatInputRef"
      :model-value="inputMessage"
      :is-loading="isAssistantLoading"
      :token-usage="tokenUsage"
      :is-compressing="isCompressing"
      :can-compact="canCompact"
      @update:model-value="emit('update:inputMessage', $event)"
      @send="handleSend"
      @interrupt="emit('interrupt')"
      @request-file-list="emit('request-file-list')"
      @compact="emit('compact')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from "vue";
import { ChevronDown } from "lucide-vue-next";
import ChatInput from "./ChatInput.vue";
import ChatMessageList from "./ChatMessageList.vue";
import ToolConfirmation from "./ToolConfirmation.vue";
import QuestionDialog from "./QuestionDialog.vue";
import RollbackConfirmation from "./RollbackConfirmation.vue";
import FilePickerDialog from "./FilePickerDialog.vue";

interface ParsedMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
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

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cached_tokens?: number;
  percentage?: number;
  max_tokens?: number;
}

const props = defineProps<{
  parsedMessages: ParsedMessage[];
  expandedToolIds: string[];
  isAssistantLoading: boolean;
  isHistoryLoading: boolean;
  isSessionBusy: boolean;
  pendingToolConfirmations: PendingToolConfirmation[];
  pendingQuestions: PendingQuestion[];
  pendingRollbackConfirmation: PendingRollbackConfirmation | null;
  filePickerState: FilePickerState;
  filePickerQuery: string;
  filteredFileOptions: string[];
  inputMessage: string;
  t: (key: string, values?: Record<string, unknown>) => string;
  formatJson: (data: string | object) => string;
  tokenUsage?: TokenUsage;
  isCompressing?: boolean;
  canCompact?: boolean;
}>();

const emit = defineEmits<{
  (event: "toggle-tool", id: string): void;
  (event: "rollback-message", messageIndex: number): void;
  (
    event: "submit-tool-confirmation",
    toolCallId: string,
    result: "approve" | "approve_always" | "reject" | "reject_with_reply",
    reason?: string
  ): void;
  (event: "toggle-question-option", toolCallId: string, option: string): void;
  (event: "submit-question", item: PendingQuestion): void;
  (event: "cancel-question", toolCallId: string): void;
  (
    event: "submit-rollback-confirmation",
    rollbackFiles: boolean | null,
    selectedFiles?: string[]
  ): void;
  (event: "close-file-picker"): void;
  (event: "append-selected-file-to-input", filePath: string): void;
  (event: "send"): void;
  (event: "interrupt"): void;
  (event: "request-file-list"): void;
  (event: "update:inputMessage", value: string): void;
  (event: "update:filePickerQuery", value: string): void;
  (event: "compact"): void;
}>();

const messagesWrapperRef = ref<HTMLDivElement | null>(null);
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null);
const showScrollButton = ref(false);

// 检测是否需要显示滚动按钮（距离底部超过 100px 时显示）
const checkScrollPosition = () => {
  const wrapper = messagesWrapperRef.value;
  if (!wrapper) return;

  const threshold = 100;
  const distanceFromBottom =
    wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight;
  showScrollButton.value = distanceFromBottom > threshold;
};

// 滚动到底部
const scrollToBottom = () => {
  // 使用双重 nextTick 确保消息完全渲染
  nextTick(() => {
    nextTick(() => {
      if (messagesWrapperRef.value) {
        messagesWrapperRef.value.scrollTop =
          messagesWrapperRef.value.scrollHeight;
      }
    });
  });
};

onMounted(() => {
  messagesWrapperRef.value?.addEventListener("scroll", checkScrollPosition);
});

onUnmounted(() => {
  messagesWrapperRef.value?.removeEventListener("scroll", checkScrollPosition);
});

const handleSend = () => {
  scrollToBottom();
  emit("send");
};

const handleFileSelect = (filePath: string) => {
  emit("append-selected-file-to-input", filePath);
  emit("close-file-picker");
  nextTick(() => {
    chatInputRef.value?.focus();
  });
};
</script>

<style scoped>
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.messages-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0.75rem;
  display: flex;
  justify-content: center;
}

.messages-container {
  width: 100%;
  max-width: 900px;
}

.interaction-panel {
  padding: 0.75rem 1rem;
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  justify-content: center;
}

.interaction-panel > * {
  max-width: 900px;
}

/* 滚动到底部按钮 */
.scroll-to-bottom-btn {
  position: absolute;
  bottom: 5rem;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: rgba(var(--bg-secondary-rgb), 0.85);
  backdrop-filter: blur(4px);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease,
    box-shadow 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.scroll-to-bottom-btn:hover {
  background: var(--bg-primary);
  color: var(--color-accent);
  border-color: var(--color-accent);
  transform: translateX(-50%) translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 按钮过渡动画 */
.scroll-btn-enter-active {
  transition: all 0.2s ease;
}

.scroll-btn-leave-active {
  transition: opacity 0.2s ease;
}

.scroll-btn-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.scroll-btn-leave-to {
  opacity: 0;
  transform: translateX(-50%);
}

@media (max-width: 640px) {
  .interaction-card {
    min-width: 280px;
  }

  .scroll-to-bottom-btn {
    width: 36px;
    height: 36px;
    bottom: 5rem;
    right: 1.5rem;
  }
}
</style>
