<template>
  <div class="interaction-card">
    <div class="card-title">{{ t("chat.rollbackTitle") }}</div>
    <div class="card-text">
      {{
        t("chat.rollbackFiles", {
          fileCount: filePaths.length,
          notebookCount: notebookCount,
        })
      }}
    </div>
    <pre class="card-code">{{ filePaths.join("\n") }}</pre>
    <div class="card-actions">
      <button class="btn-primary" @click="emit('confirm-rollback-files')">
        {{ t("chat.rollbackFilesBtn") }}
      </button>
      <button class="btn-secondary" @click="emit('confirm-rollback-session')">
        {{ t("chat.rollbackSessionOnly") }}
      </button>
      <button class="btn-reject" @click="emit('cancel')">
        {{ t("chat.cancelRollback") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  filePaths: string[];
  notebookCount: number;
  t: (key: string, values?: Record<string, unknown>) => string;
}>();

const emit = defineEmits<{
  (event: "confirm-rollback-files"): void;
  (event: "confirm-rollback-session"): void;
  (event: "cancel"): void;
}>();
</script>

<style scoped>
.interaction-card {
  min-width: 320px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 0.75rem;
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

.btn-reject {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
}

.btn-reject:hover {
  opacity: 0.9;
}

@media (max-width: 640px) {
  .interaction-card {
    min-width: 280px;
  }
}
</style>
