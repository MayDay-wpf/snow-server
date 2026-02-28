<template>
  <div class="chat-container">
    <div class="messages-wrapper">
      <div class="messages-container">
        <ChatMessageList
          :messages="parsedMessages"
          :expanded-tool-ids="expandedToolIds"
          :is-assistant-loading="isAssistantLoading"
          @toggle-tool="emit('toggle-tool', $event)"
          @rollback-message="emit('rollback-message', $event)"
        />
      </div>
    </div>

    <div
      v-if="
        pendingToolConfirmations.length ||
        pendingQuestions.length ||
        pendingRollbackConfirmation
      "
      class="interaction-panel"
    >
      <div
        v-for="item in pendingToolConfirmations"
        :key="item.toolCallId"
        class="interaction-card"
      >
        <div class="card-title">{{ t("chat.toolConfirmTitle") }}</div>
        <div class="card-text">
          {{ t("chat.toolName") }}: {{ item.toolName }}
        </div>
        <pre class="card-code">{{ formatJson(item.toolArguments) }}</pre>
        <div class="card-actions">
          <button
            class="btn-approve"
            @click="
              emit('submit-tool-confirmation', item.toolCallId, 'approve')
            "
          >
            {{ t("chat.approve") }}
          </button>
          <button
            class="btn-approve-always"
            @click="
              emit(
                'submit-tool-confirmation',
                item.toolCallId,
                'approve_always'
              )
            "
          >
            {{ t("chat.approveAlways") }}
          </button>
          <button
            class="btn-reject"
            @click="emit('submit-tool-confirmation', item.toolCallId, 'reject')"
          >
            {{ t("chat.reject") }}
          </button>
        </div>
      </div>

      <div
        v-for="item in pendingQuestions"
        :key="item.toolCallId"
        class="interaction-card"
      >
        <div class="card-title">{{ t("chat.questionTitle") }}</div>
        <div class="card-text">{{ item.question }}</div>
        <div class="options-wrap">
          <label
            v-for="option in item.options"
            :key="option"
            class="option-checkbox"
          >
            <input
              type="checkbox"
              :checked="item.selectedOptions.includes(option)"
              @change="emit('toggle-question-option', item.toolCallId, option)"
            />
            <span>{{ option }}</span>
          </label>
        </div>
        <textarea
          v-model="item.customInput"
          class="custom-input"
          rows="3"
          :placeholder="t('chat.customInputPlaceholder')"
        />
        <div class="card-actions">
          <button class="btn-primary" @click="emit('submit-question', item)">
            {{ t("chat.submit") }}
          </button>
          <button
            class="btn-secondary"
            @click="emit('cancel-question', item.toolCallId)"
          >
            {{ t("chat.cancel") }}
          </button>
        </div>
      </div>

      <div v-if="pendingRollbackConfirmation" class="interaction-card">
        <div class="card-title">{{ t("chat.rollbackTitle") }}</div>
        <div class="card-text">
          {{
            t("chat.rollbackFiles", {
              fileCount: pendingRollbackConfirmation.filePaths.length,
              notebookCount: pendingRollbackConfirmation.notebookCount,
            })
          }}
        </div>
        <pre class="card-code">{{
          pendingRollbackConfirmation.filePaths.join("\n")
        }}</pre>
        <div class="card-actions">
          <button
            class="btn-primary"
            @click="emit('submit-rollback-confirmation', true)"
          >
            {{ t("chat.rollbackFilesBtn") }}
          </button>
          <button
            class="btn-secondary"
            @click="emit('submit-rollback-confirmation', false)"
          >
            {{ t("chat.rollbackSessionOnly") }}
          </button>
          <button
            class="btn-reject"
            @click="emit('submit-rollback-confirmation', null)"
          >
            {{ t("chat.cancelRollback") }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="filePickerState.visible" class="file-picker-overlay">
      <div class="interaction-card file-picker-card">
        <div class="file-picker-header">
          <div class="card-title">{{ t("chat.fileListTitle") }}</div>
          <button
            class="file-picker-close-btn"
            type="button"
            :title="t('chat.close')"
            @click="emit('close-file-picker')"
          >
            <X :size="16" />
          </button>
        </div>
        <div v-if="filePickerState.loading" class="card-text">
          {{ t("chat.fileListLoading") }}
        </div>
        <div v-else-if="filePickerState.error" class="card-text">
          {{ filePickerState.error }}
        </div>
        <template v-else>
          <input
            v-model="filePickerQuery"
            class="file-search-input"
            type="text"
            :placeholder="t('chat.fileListSearchPlaceholder')"
          />
          <FileTreePicker
            :files="filteredFileOptions"
            :expand-all="Boolean(filePickerQuery.trim())"
            :empty-text="t('chat.fileListNoMatch')"
            @select="emit('append-selected-file-to-input', $event)"
          />
        </template>
      </div>
    </div>

    <ChatInput
      :model-value="inputMessage"
      :is-loading="isAssistantLoading"
      @update:model-value="emit('update:inputMessage', $event)"
      @send="emit('send')"
      @interrupt="emit('interrupt')"
      @request-file-list="emit('request-file-list')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { X } from "lucide-vue-next";
import ChatInput from "./ChatInput.vue";
import ChatMessageList from "./ChatMessageList.vue";
import FileTreePicker from "./FileTreePicker.vue";

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

const props = defineProps<{
  parsedMessages: ParsedMessage[];
  expandedToolIds: string[];
  isAssistantLoading: boolean;
  pendingToolConfirmations: PendingToolConfirmation[];
  pendingQuestions: PendingQuestion[];
  pendingRollbackConfirmation: PendingRollbackConfirmation | null;
  filePickerState: FilePickerState;
  filePickerQuery: string;
  filteredFileOptions: string[];
  inputMessage: string;
  t: (key: string, values?: Record<string, unknown>) => string;
  formatJson: (data: string | object) => string;
}>();

const emit = defineEmits<{
  (event: "toggle-tool", id: string): void;
  (event: "rollback-message", messageIndex: number): void;
  (
    event: "submit-tool-confirmation",
    toolCallId: string,
    result: "approve" | "approve_always" | "reject"
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
}>();

const filePickerQuery = computed({
  get: () => props.filePickerQuery,
  set: (value: string) => emit("update:filePickerQuery", value),
});
</script>

<style scoped>
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  justify-content: center;
}

.interaction-panel > * {
  max-width: 900px;
}

.file-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.interaction-card {
  min-width: 320px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 0.75rem;
}

.file-picker-card {
  width: min(900px, 100%);
  max-height: min(78vh, 640px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.file-picker-header .card-title {
  margin-bottom: 0;
}

.file-picker-close-btn {
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
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.file-picker-close-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.file-search-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 0.5rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.8125rem;
}

.file-search-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.card-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
  color: var(--text-primary);
}

.card-text {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.card-code {
  margin: 0;
  padding: 0.5rem;
  background: var(--bg-code, #1e1e1e);
  color: var(--text-code, #d4d4d4);
  border-radius: 6px;
  font-size: 0.75rem;
  overflow-x: auto;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.card-actions button {
  padding: 0.375rem 0.625rem;
  font-size: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.btn-primary {
  background: var(--color-accent);
  color: var(--color-bg);
  border-color: var(--color-accent);
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border-color);
}

.btn-secondary:hover {
  background: var(--bg-primary);
}

.btn-approve {
  background: #22c55e;
  color: white;
  border-color: #22c55e;
}

.btn-approve:hover {
  opacity: 0.9;
}

.btn-approve-always {
  background: #16a34a;
  color: white;
  border-color: #16a34a;
}

.btn-approve-always:hover {
  opacity: 0.9;
}

.btn-reject {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
}

.btn-reject:hover {
  opacity: 0.9;
}

.options-wrap {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.option-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.option-checkbox:hover {
  border-color: var(--color-accent);
}

.option-checkbox input[type="checkbox"] {
  margin: 0;
}

.custom-input {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.8125rem;
  box-sizing: border-box;
  resize: vertical;
}

.custom-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

@media (max-width: 640px) {
  .interaction-card {
    min-width: 280px;
  }
}
</style>
