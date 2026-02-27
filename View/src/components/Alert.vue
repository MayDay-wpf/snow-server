<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-vue-next";

export interface AlertProps {
  type?: "success" | "error" | "info" | "warning";
  message: string;
  duration?: number;
  position?: "top" | "top-right" | "top-left" | "bottom" | "bottom-right" | "bottom-left";
  onClose?: () => void;
}

const props = withDefaults(defineProps<AlertProps>(), {
  type: "info",
  duration: 3000,
  position: "top-right",
});

const visible = ref(false);
const timer = ref<number | null>(null);

const iconComponent = computed(() => {
  switch (props.type) {
    case "success":
      return CheckCircle;
    case "error":
      return AlertCircle;
    case "warning":
      return AlertTriangle;
    default:
      return Info;
  }
});

const positionClass = computed(() => {
  return `alert-${props.position}`;
});

const close = () => {
  visible.value = false;
  if (timer.value) {
    clearTimeout(timer.value);
  }
  setTimeout(() => {
    props.onClose?.();
  }, 300);
};

onMounted(() => {
  visible.value = true;
  if (props.duration > 0) {
    timer.value = window.setTimeout(() => {
      close();
    }, props.duration);
  }
});
</script>

<template>
  <Transition name="alert">
    <div v-if="visible" :class="['alert', `alert-${type}`, positionClass]">
      <div class="alert-content">
        <component :is="iconComponent" :size="18" class="alert-icon" />
        <span class="alert-message">{{ message }}</span>
        <button class="alert-close" @click="close" :title="'关闭'">
          <X :size="16" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.alert {
  position: fixed;
  z-index: 9999;
  min-width: 280px;
  max-width: 420px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  padding: 14px 16px;
  box-shadow: 4px 4px 0 rgba(44, 36, 22, 0.15);
}

.alert::before {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  right: 3px;
  bottom: 3px;
  border: 1px solid var(--color-border);
  opacity: 0.3;
  pointer-events: none;
}

/* 位置样式 */
.alert-top {
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
}

.alert-top-right {
  top: 20px;
  right: 20px;
}

.alert-top-left {
  top: 20px;
  left: 20px;
}

.alert-bottom {
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
}

.alert-bottom-right {
  bottom: 20px;
  right: 20px;
}

.alert-bottom-left {
  bottom: 20px;
  left: 20px;
}

.alert-content {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}

.alert-icon {
  flex-shrink: 0;
}

.alert-message {
  flex: 1;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
}

.alert-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.alert-close:hover {
  color: var(--color-text);
}

/* 类型样式 */
.alert-success {
  border-left: 3px solid #22c55e;
}

.alert-success .alert-icon {
  color: #22c55e;
}

.alert-error {
  border-left: 3px solid #ef4444;
}

.alert-error .alert-icon {
  color: #ef4444;
}

.alert-warning {
  border-left: 3px solid #f59e0b;
}

.alert-warning .alert-icon {
  color: #f59e0b;
}

.alert-info {
  border-left: 3px solid #3b82f6;
}

.alert-info .alert-icon {
  color: #3b82f6;
}

/* 动画 */
.alert-enter-active,
.alert-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.alert-enter-from {
  opacity: 0;
}

.alert-top.alert-enter-from,
.alert-top-right.alert-enter-from,
.alert-top-left.alert-enter-from {
  transform: translateY(-20px);
}

.alert-top.alert-enter-from {
  transform: translate(-50%, -20px);
}

.alert-bottom.alert-enter-from,
.alert-bottom-right.alert-enter-from,
.alert-bottom-left.alert-enter-from {
  transform: translateY(20px);
}

.alert-bottom.alert-enter-from {
  transform: translate(-50%, 20px);
}

.alert-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

@media (max-width: 640px) {
  .alert {
    min-width: auto;
    max-width: calc(100vw - 40px);
    left: 20px !important;
    right: 20px !important;
    transform: none !important;
  }

  .alert-top,
  .alert-top-right,
  .alert-top-left {
    top: 20px;
  }

  .alert-bottom,
  .alert-bottom-right,
  .alert-bottom-left {
    bottom: 20px;
  }
}
</style>
