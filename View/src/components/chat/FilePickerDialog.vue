<template>
  <div class="file-picker-overlay" @click="handleOverlayClick">
    <div class="interaction-card file-picker-card" @click.stop>
      <div class="file-picker-header">
        <div class="card-title">{{ t("chat.fileListTitle") }}</div>
        <button
          class="file-picker-close-btn"
          type="button"
          :title="t('chat.close')"
          @click="emit('close')"
        >
          <X :size="16" />
        </button>
      </div>
      <div v-if="loading" class="card-text">{{ t("chat.fileListLoading") }}</div>
      <div v-else-if="error" class="card-text">{{ error }}</div>
      <template v-else>
        <input
          ref="searchInputRef"
          v-model="localQuery"
          class="file-search-input"
          type="text"
          :placeholder="t('chat.fileListSearchPlaceholder')"
        />
        <FileTreePicker
          :files="files"
          :expand-all="Boolean(localQuery.trim())"
          :empty-text="t('chat.fileListNoMatch')"
          @select="handleSelect"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue";
import { X } from "lucide-vue-next";
import FileTreePicker from "./FileTreePicker.vue";

const props = defineProps<{
  visible: boolean;
  loading: boolean;
  files: string[];
  error: string;
  query: string;
  t: (key: string, values?: Record<string, unknown>) => string;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "update:query", value: string): void;
  (event: "select", filePath: string): void;
}>();

const searchInputRef = ref<HTMLInputElement | null>(null);

const localQuery = computed({
  get: () => props.query,
  set: (value: string) => emit("update:query", value),
});

// 弹窗打开且加载完成后，自动聚焦搜索框
watch(
  () => [props.visible, props.loading] as const,
  ([visible, loading]) => {
    if (visible && !loading) {
      nextTick(() => {
        searchInputRef.value?.focus();
      });
    }
  }
);

const handleOverlayClick = () => {
  emit("close");
};

const handleSelect = (filePath: string) => {
  emit("select", filePath);
};
</script>

<style scoped>
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

.card-title {
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.8125rem;
  color: var(--text-primary);
}

.file-picker-header .card-title {
  margin-bottom: 0;
}

.card-text {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
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

@media (max-width: 640px) {
  .interaction-card {
    min-width: 280px;
  }
}
</style>
