<template>
  <div class="interaction-card">
    <div class="card-title">{{ t("chat.questionTitle") }}</div>
    <div class="card-text">{{ question }}</div>
    <div class="options-wrap">
      <label v-for="option in options" :key="option" class="option-checkbox">
        <input
          type="checkbox"
          :checked="selectedOptions.includes(option)"
          @change="toggleOption(option)"
        />
        <span>{{ option }}</span>
      </label>
    </div>
    <textarea
      v-model="customInputValue"
      class="custom-input"
      rows="3"
      :placeholder="t('chat.customInputPlaceholder')"
    />
    <div class="card-actions">
      <button class="btn-primary" @click="submit">
        {{ t("chat.submit") }}
      </button>
      <button class="btn-secondary" @click="emit('cancel', toolCallId)">
        {{ t("chat.cancel") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface QuestionModel {
  question: string;
  options: string[];
  toolCallId: string;
  selectedOptions: string[];
  customInput: string;
}

const props = defineProps<{
  question: string;
  options: string[];
  toolCallId: string;
  selectedOptions: string[];
  customInput: string;
  t: (key: string, values?: Record<string, unknown>) => string;
}>();

const emit = defineEmits<{
  (event: "toggle-option", option: string): void;
  (event: "submit", item: QuestionModel): void;
  (event: "cancel", toolCallId: string): void;
}>();

const customInputValue = computed({
  get: () => props.customInput,
  set: (value: string) => {
    emit("submit", {
      question: props.question,
      options: props.options,
      toolCallId: props.toolCallId,
      selectedOptions: props.selectedOptions,
      customInput: value,
    });
  },
});
const toggleOption = (option: string) => {
  emit("toggle-option", option);
};

const submit = () => {
  emit("submit", {
    question: props.question,
    options: props.options,
    toolCallId: props.toolCallId,
    selectedOptions: props.selectedOptions,
    customInput: props.customInput,
  });
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
