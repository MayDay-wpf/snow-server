<script setup lang="ts">
// Props interface

interface Props {
  modelValue: boolean;
  disabled?: boolean;
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  label: "",
});

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const toggle = () => {
  if (!props.disabled) {
    emit("update:modelValue", !props.modelValue);
  }
};
</script>

<template>
  <div class="switch-wrapper" :class="{ disabled }">
    <label v-if="label" class="switch-label">{{ label }}</label>
    <button
      type="button"
      class="switch"
      :class="{ active: modelValue, disabled }"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="switch-track">
        <span class="switch-thumb"></span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.switch-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--color-text);
}

.switch {
  position: relative;
  width: 44px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.switch:disabled,
.switch.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.switch-track {
  position: absolute;
  top: 3px;
  left: 3px;
  right: 3px;
  bottom: 3px;
  background: var(--color-bg);
  transition: background-color 0.2s;
}

.switch-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  background: var(--color-text-muted);
  border: 1px solid var(--color-border);
  transition: all 0.2s;
}

.switch.active .switch-track {
  background: var(--color-accent);
}

.switch.active .switch-thumb {
  left: calc(100% - 15px);
  background: var(--color-bg);
}

.switch:hover:not(.disabled) {
  box-shadow: 2px 2px 0 rgba(44, 36, 22, 0.15);
}

.switch:active:not(.disabled) .switch-thumb {
  transform: scale(0.95);
}
</style>
