<template>
  <div class="chat-header">
    <button class="back-button" @click="$emit('goBack')">
      <ArrowLeft :size="18" />
      {{ backText }}
    </button>

    <button
      class="history-btn"
      :title="historyTitle"
      @click="$emit('toggleHistoryList', $event)"
    >
      <List :size="18" />
    </button>

    <div class="header-info">
      <h2 :title="displayTitle">{{ displayTitle }}</h2>
      <span v-if="messageCount" class="message-count"
        >{{ messageCount }} {{ messageCountText }}</span
      >
    </div>

    <div class="header-actions">
      <button class="new-session-button" @click="$emit('createNewSession')">
        <Plus :size="16" />
        <span>{{ newSessionText }}</span>
      </button>
      <button
        class="settings-btn"
        :title="settingsTitle"
        @click="$emit('toggleSettings', $event)"
      >
        <Settings :size="18" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ArrowLeft, List, Plus, Settings } from "lucide-vue-next";

const props = defineProps<{
  sessionTitle?: string;
  instanceName: string;
  messageCount: number;
  backText: string;
  newSessionText: string;
  messageCountText: string;
  settingsTitle: string;
  historyTitle: string;
}>();

defineEmits<{
  goBack: [];
  createNewSession: [];
  toggleSettings: [event: Event];
  toggleHistoryList: [event: Event];
}>();

const displayTitle = computed(() => props.sessionTitle || props.instanceName);
</script>

<style scoped>
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8125rem;
  transition: all 0.2s;
  flex-shrink: 0;
}

.back-button:hover {
  background: var(--bg-primary);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.header-info {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-right: auto;
  margin-left: 0.75rem;
  min-width: 0;
  flex: 1;
}

.header-info h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.new-session-button {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-accent);
  color: var(--color-bg);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  transition: opacity 0.2s;
}

.new-session-button:hover {
  opacity: 0.9;
}

.history-btn,
.settings-btn {
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
}

.history-btn:hover,
.settings-btn:hover {
  background: var(--bg-primary);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

@media (max-width: 640px) {
  .chat-header {
    padding: 0.5rem 0.75rem;
  }

  .header-info {
    margin-left: 0.5rem;
    margin-right: 0.5rem;
  }

  .header-info h2 {
    font-size: 0.875rem;
  }

  .message-count {
    display: none;
  }

  .new-session-button span {
    display: none;
  }
}
</style>
