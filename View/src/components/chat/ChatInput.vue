<template>
  <div class="chat-input-container">
    <div class="chat-input-wrapper">
      <button class="icon-btn file-btn" @click="triggerFilePicker" :disabled="isLoading">
        <Paperclip :size="20" />
      </button>
      <textarea ref="textareaRef" v-model="inputValue" @keydown="handleKeydown" :disabled="isLoading"
        :placeholder="t('chat.inputPlaceholder')" class="message-input" rows="1" />
      <button @click="handleSend" :disabled="!isLoading && !inputValue.trim()"
        :class="['icon-btn send-btn', { 'interrupt-btn': isLoading }]"
        :title="isLoading ? t('chat.interrupt') : t('chat.send')">
        <Square v-if="isLoading" :size="18" />
        <ArrowUpFromDotIcon v-else :size="18" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Square, Paperclip, ArrowUpFromDotIcon } from "lucide-vue-next";

const MAX_TEXTAREA_HEIGHT = 160;

const props = defineProps<{
  modelValue: string;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "send"): void;
  (e: "interrupt"): void;
  (e: "requestFileList"): void;
}>();

const { t } = useI18n();
const inputValue = ref(props.modelValue);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const isMobileDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  // 优先使用现代 API，避免触屏笔记本被误判为移动端
  if ("userAgentData" in navigator) {
    const uaData = navigator.userAgentData as { mobile?: boolean };
    if (typeof uaData.mobile === "boolean") {
      return uaData.mobile;
    }
  }

  const mobileRegex =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

  if (mobileRegex.test(navigator.userAgent)) {
    return true;
  }

  return window.matchMedia("(pointer: coarse)").matches;
};

const resizeTextarea = () => {
  const textarea = textareaRef.value;
  if (!textarea) {
    return;
  }

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(
    textarea.scrollHeight,
    MAX_TEXTAREA_HEIGHT
  )}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
};

watch(
  () => props.modelValue,
  (newValue) => {
    inputValue.value = newValue;
  }
);

watch(inputValue, (newValue) => {
  emit("update:modelValue", newValue);
  nextTick(resizeTextarea);
});

const handleSend = () => {
  if (props.isLoading) {
    emit("interrupt");
  } else if (inputValue.value.trim()) {
    emit("send");
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Enter") {
    return;
  }

  if (isMobileDevice()) {
    return;
  }

  if (event.shiftKey) {
    return;
  }

  event.preventDefault();
  handleSend();
};

const triggerFilePicker = () => {
  emit("requestFileList");
};

onMounted(() => {
  resizeTextarea();
});
</script>

<style scoped>
.chat-input-container {
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}

.chat-input-wrapper {
  display: flex;
  align-items: flex-end;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  border-radius: 8px;
  gap: 0.5rem;
  width: 100%;
  max-width: 900px;
}

.message-input {
  flex: 1;
  padding: 0.625rem 0.875rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.5;
  outline: none;
  resize: none;
  max-height: 160px;
  overflow-y: hidden;
}

.message-input::placeholder {
  color: var(--text-secondary);
}

.message-input:disabled {
  opacity: 0.6;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: transparent;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.icon-btn:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--color-accent);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  background: var(--color-accent);
  color: var(--color-bg);
}

.send-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.interrupt-btn {
  background: #dc2626;
  color: white;
}

.interrupt-btn:hover:not(:disabled) {
  background: #b91c1c;
  filter: none;
}

.file-btn {
  margin-right: 0.25rem;
}
</style>
