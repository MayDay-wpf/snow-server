<template>
  <div class="interaction-card">
    <div class="card-title">{{ t("chat.toolConfirmTitle") }}</div>
    <div class="card-text">{{ t("chat.toolName") }}: {{ toolName }}</div>
    <pre class="card-code">{{ formatJson(toolArguments) }}</pre>
    <div class="card-actions">
      <button class="btn-approve" @click="emit('approve')">
        {{ t("chat.approve") }}
      </button>
      <button class="btn-approve-always" @click="emit('approve-always')">
        {{ t("chat.approveAlways") }}
      </button>
      <button class="btn-reject" @click="openRejectInput">
        {{ t("chat.rejectWithReply") }}
      </button>
      <button class="btn-reject" @click="emit('reject')">
        {{ t("chat.reject") }}
      </button>
    </div>
    <div v-if="showRejectInput">
      <textarea
        v-model="rejectReason"
        class="custom-input"
        rows="3"
        :placeholder="t('chat.rejectReplyPlaceholder')"
      />
      <div class="card-actions">
        <button class="btn-primary" @click="submitRejectWithReply">
          {{ t("chat.submit") }}
        </button>
        <button class="btn-secondary" @click="cancelRejectInput">
          {{ t("chat.cancel") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  toolName: string;
  toolArguments: string;
  t: (key: string, values?: Record<string, unknown>) => string;
  formatJson: (data: string | object) => string;
}>();

const emit = defineEmits<{
  (event: "approve"): void;
  (event: "approve-always"): void;
  (event: "reject"): void;
  (event: "reject-with-reply", reason: string): void;
}>();

const showRejectInput = ref(false);
const rejectReason = ref("");

const openRejectInput = () => {
  showRejectInput.value = true;
  rejectReason.value = "";
};

const cancelRejectInput = () => {
  showRejectInput.value = false;
  rejectReason.value = "";
};

const submitRejectWithReply = () => {
  emit("reject-with-reply", rejectReason.value.trim());
  cancelRejectInput();
};
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
