<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";

interface Option {
  value: string;
  label: string;
}

interface Props {
  modelValue: string;
  options: Option[];
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  label: "",
  placeholder: "Select...",
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const isOpen = ref(false);
const selectRef = ref<HTMLElement | null>(null);

const selectedOption = computed(() => {
  return props.options.find((opt) => opt.value === props.modelValue);
});

const toggleDropdown = (event: Event) => {
  event.stopPropagation();
  if (!props.disabled) {
    isOpen.value = !isOpen.value;
  }
};

const selectOption = (option: Option, event: Event) => {
  event.stopPropagation();
  emit("update:modelValue", option.value);
  isOpen.value = false;
};

const handleClickOutside = (event: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
  <div class="select-wrapper" ref="selectRef" :class="{ disabled }">
    <label v-if="label" class="select-label">{{ label }}</label>
    <div class="select-container">
      <button
        type="button"
        class="select-trigger"
        :class="{ open: isOpen, disabled }"
        :disabled="disabled"
        @click="toggleDropdown"
      >
        <span class="select-value">
          {{ selectedOption?.label || placeholder }}
        </span>
        <span class="select-arrow" :class="{ open: isOpen }">▼</span>
      </button>
      <Transition name="dropdown">
        <div v-if="isOpen" class="select-dropdown" @click.stop>
          <div
            v-for="option in options"
            :key="option.value"
            class="select-option"
            :class="{ selected: option.value === modelValue }"
            @click="selectOption(option, $event)"
          >
            {{ option.label }}
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.select-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.select-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--color-text);
}

.select-container {
  position: relative;
}

.select-trigger {
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  font-family: inherit;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  transition: background-color 0.2s, box-shadow 0.2s;
}

.select-trigger:disabled,
.select-trigger.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.select-trigger:hover:not(.disabled) {
  background: var(--color-bg-card);
}

.select-trigger:focus,
.select-trigger.open {
  background: var(--color-bg);
  box-shadow: 3px 3px 0 rgba(44, 36, 22, 0.15);
  outline: none;
}

.select-value {
  flex: 1;
  text-align: left;
  color: var(--color-text);
}

.select-trigger:disabled .select-value,
.select-trigger.disabled .select-value {
  color: var(--color-text-muted);
}

.select-arrow {
  font-size: 8px;
  color: var(--color-text-muted);
  transition: transform 0.2s;
}

.select-arrow.open {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
  box-shadow: 4px 4px 0 rgba(44, 36, 22, 0.1);
}

.select-option {
  padding: 10px 14px;
  cursor: pointer;
  transition: background-color 0.15s;
  color: var(--color-text);
  font-size: 14px;
}

.select-option:hover {
  background: var(--color-bg-card);
}

.select-option.selected {
  background: var(--color-accent);
  color: var(--color-bg);
}

.select-option.selected:hover {
  background: var(--color-text-muted);
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
