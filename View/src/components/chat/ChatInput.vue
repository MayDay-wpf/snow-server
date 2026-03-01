<template>
  <div class="chat-input-container">
    <div class="chat-input-wrapper">
      <div class="input-area">
        <textarea
          ref="textareaRef"
          v-model="inputValue"
          @keydown="handleKeydown"
          :disabled="isLoading || isCompressing"
          :placeholder="t('chat.inputPlaceholder')"
          class="message-input"
          rows="1"
        />
        <div v-if="tokenUsageDisplay" class="token-usage-bar">
          <span class="token-percentage" :class="tokenUsageDisplay.colorClass"
            >{{ tokenUsageDisplay.percentage }}%</span
          >
          <span class="token-divider">·</span>
          <span class="token-count">{{ tokenUsageDisplay.totalTokens }}</span>
          <span v-if="tokenUsageDisplay.hasCache" class="token-cache"
            >↯ {{ tokenUsageDisplay.cacheReadTokens }}</span
          >
          <button
            v-if="showCompactButton"
            class="compact-btn"
            :disabled="!canCompact"
            :title="compactButtonTitle"
            @click="handleCompact"
          >
            <Loader2 v-if="isCompressing" :size="12" class="spin-animation" />
            <Minimize2 v-else :size="12" />
          </button>
        </div>
      </div>
      <div class="input-actions">
        <button
          class="icon-btn file-btn"
          @click="triggerFilePicker"
          :disabled="isLoading || isCompressing"
        >
          <Paperclip :size="20" />
        </button>
        <button
          @click="handleSend"
          :disabled="!canSend"
          :class="['icon-btn send-btn', { 'interrupt-btn': isLoading }]"
          :title="isLoading ? t('chat.interrupt') : t('chat.send')"
        >
          <Square v-if="isLoading" :size="18" />
          <ArrowUpFromDotIcon v-else :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  Square,
  Paperclip,
  ArrowUpFromDotIcon,
  Minimize2,
  Loader2,
} from "lucide-vue-next";

const MAX_TEXTAREA_HEIGHT = 160;

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
  modelValue: string;
  isLoading: boolean;
  tokenUsage?: TokenUsage;
  isCompressing?: boolean;
  canCompact?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "send"): void;
  (e: "interrupt"): void;
  (e: "requestFileList"): void;
  (e: "compact"): void;
}>();

const { t } = useI18n();
const inputValue = ref(props.modelValue);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const formatTokenCount = (num: number): string => {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
};

const tokenUsageDisplay = computed(() => {
  if (!props.tokenUsage) return null;
  const { percentage, prompt_tokens, cache_read_input_tokens, cached_tokens } =
    props.tokenUsage;
  if (percentage === undefined) return null;

  // Determine color based on percentage
  let colorClass = "token-usage-low";
  if (percentage >= 90) colorClass = "token-usage-high";
  else if (percentage >= 75) colorClass = "token-usage-medium";

  // Check for cache metrics
  const hasCacheRead = (cache_read_input_tokens || 0) > 0;
  const hasCached = (cached_tokens || 0) > 0;

  return {
    percentage: percentage.toFixed(1),
    colorClass,
    totalTokens: formatTokenCount(prompt_tokens || 0),
    hasCache: hasCacheRead || hasCached,
    cacheReadTokens: hasCacheRead
      ? formatTokenCount(cache_read_input_tokens || 0)
      : null,
  };
});

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

const canSend = computed(() => {
  // Can send when:
  // 1. Not compressing
  // 2. Either loading (can interrupt) or has input
  if (props.isCompressing) return false;
  return props.isLoading || inputValue.value.trim().length > 0;
});

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

// Compact button logic
const showCompactButton = computed(() => {
  // Only show compact button when there is token usage display
  return (
    props.tokenUsage !== undefined && props.tokenUsage.percentage !== undefined
  );
});

const canCompact = computed(() => {
  // Can only compact when:
  // 1. Not currently loading (AI is not processing)
  // 2. Not currently compressing
  // 3. Dialog ended (canCompact prop is true from parent)
  return !props.isLoading && !props.isCompressing && props.canCompact !== false;
});

const compactButtonTitle = computed(() => {
  if (props.isLoading) {
    return "Cannot compact while AI is responding";
  }
  if (props.isCompressing) {
    return "Compressing...";
  }
  if (props.canCompact === false) {
    return "Wait for dialog to end before compacting";
  }
  return "Compact context";
});

const handleCompact = () => {
  if (!canCompact.value) return;
  emit("compact");
};

onMounted(() => {
  resizeTextarea();
});

// 暴露 focus 方法供父组件调用
defineExpose({
  focus: () => {
    textareaRef.value?.focus();
  },
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

.input-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.message-input {
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
  min-height: 36px;
}

.message-input::placeholder {
  color: var(--text-secondary);
}

.message-input:disabled {
  opacity: 0.6;
}

.token-usage-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.875rem 0.375rem;
  font-size: 0.6875rem;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-color);
  margin-top: 0.25rem;
}

.token-usage-bar .token-percentage {
  font-weight: 600;
}

.token-usage-bar .token-usage-low {
  color: var(--success-color, #22c55e);
}

.token-usage-bar .token-usage-medium {
  color: var(--warning-color, #f59e0b);
}

.token-usage-bar .token-usage-high {
  color: var(--error-color, #ef4444);
}

.token-usage-bar .token-divider {
  opacity: 0.5;
  margin: 0 0.125rem;
}

.token-usage-bar .token-cache {
  color: var(--info-color, #3b82f6);
  margin-left: 0.25rem;
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
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

.compact-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: transparent;
  color: var(--text-secondary);
  margin-left: 0.25rem;
  padding: 0;
}

.compact-btn:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--color-accent);
}

.compact-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.spin-animation {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .chat-input-container {
    padding: 0.5rem 0.75rem;
  }

  .chat-input-wrapper {
    padding: 0.375rem;
  }

  .message-input {
    padding: 0.5rem 0.625rem;
    font-size: 0.875rem;
    min-height: 32px;
  }

  .token-usage-bar {
    padding: 0.25rem 0.625rem;
    font-size: 0.625rem;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
  }
}
</style>
