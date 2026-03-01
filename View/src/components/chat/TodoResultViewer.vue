<template>
  <div class="todo-result-viewer">
    <!-- 头部信息 -->
    <div class="todo-header">
      <div class="todo-title">
        <ListTodo :size="16" class="todo-icon" />
        <span>{{ t("chat.todoList") }}</span>
        <span v-if="totalCount > 0" class="todo-count"
          >({{ completedCount }}/{{ totalCount }})</span
        >
      </div>
      <div class="todo-progress" v-if="totalCount > 0">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${progressPercentage}%` }"
            :class="progressClass"
          />
        </div>
        <span class="progress-text">{{ progressPercentage }}%</span>
      </div>
    </div>

    <!-- 任务列表 -->
    <div v-if="hasTodos" class="todo-list">
      <div
        v-for="todo in rootTodos"
        :key="todo.id"
        class="todo-item"
        :class="getStatusClass(todo.status)"
      >
        <!-- 根任务 -->
        <div class="todo-main">
          <div class="todo-status-icon" :class="todo.status">
            <Circle v-if="todo.status === 'pending'" :size="14" />
            <Loader2
              v-else-if="todo.status === 'inProgress'"
              :size="14"
              class="spinning"
            />
            <CheckCircle2 v-else-if="todo.status === 'completed'" :size="14" />
          </div>
          <span class="todo-content">{{ todo.content }}</span>
        </div>

        <!-- 子任务 -->
        <div v-if="getChildTodos(todo.id).length > 0" class="todo-children">
          <div
            v-for="child in getChildTodos(todo.id)"
            :key="child.id"
            class="todo-child-item"
            :class="getStatusClass(child.status)"
          >
            <div class="todo-status-icon" :class="child.status">
              <Circle v-if="child.status === 'pending'" :size="12" />
              <Loader2
                v-else-if="child.status === 'inProgress'"
                :size="12"
                class="spinning"
              />
              <CheckCircle2
                v-else-if="child.status === 'completed'"
                :size="12"
              />
            </div>
            <span class="todo-content">{{ child.content }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="todo-empty">
      <ClipboardList :size="24" />
      <span>{{ t("chat.noTodos") }}</span>
    </div>

    <!-- 操作信息 -->
    <div v-if="operationInfo" class="todo-operation">
      <div class="operation-badge" :class="operationInfo.type">
        <component :is="operationInfo.icon" :size="12" />
        <span>{{ operationInfo.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  ListTodo,
  Circle,
  Loader2,
  CheckCircle2,
  ClipboardList,
  Plus,
  Trash2,
  Edit3,
} from "lucide-vue-next";

interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "inProgress" | "completed";
  createdAt: string;
  updatedAt: string;
  parentId?: string;
}

interface TodoList {
  sessionId: string;
  todos: TodoItem[];
  createdAt: string;
  updatedAt: string;
}

const props = defineProps<{
  data: TodoList | string;
  operation?: "get" | "add" | "update" | "delete";
  t: (key: string) => string;
}>();

// 解析数据
const todoData = computed<TodoList | null>(() => {
  if (typeof props.data === "string") {
    try {
      return JSON.parse(props.data);
    } catch {
      return null;
    }
  }
  return props.data;
});

const todos = computed(() => todoData.value?.todos || []);

// 是否有任务
const hasTodos = computed(() => todos.value.length > 0);

// 根任务（没有父任务的）
const rootTodos = computed(() => {
  return todos.value.filter((t) => !t.parentId);
});

// 获取子任务
const getChildTodos = (parentId: string) => {
  return todos.value.filter((t) => t.parentId === parentId);
};

// 统计
const totalCount = computed(() => todos.value.length);
const completedCount = computed(
  () => todos.value.filter((t) => t.status === "completed").length
);
const progressPercentage = computed(() => {
  if (totalCount.value === 0) return 0;
  return Math.round((completedCount.value / totalCount.value) * 100);
});

// 进度条样式
const progressClass = computed(() => {
  const pct = progressPercentage.value;
  if (pct === 100) return "completed";
  if (pct >= 50) return "half";
  return "start";
});

// 获取状态样式
const getStatusClass = (status: string) => {
  return {
    pending: status === "pending",
    inProgress: status === "inProgress",
    completed: status === "completed",
  };
};

// 操作信息
const operationInfo = computed(() => {
  switch (props.operation) {
    case "add":
      return {
        type: "success",
        icon: Plus,
        text: props.t("chat.todoAdded"),
      };
    case "update":
      return {
        type: "info",
        icon: Edit3,
        text: props.t("chat.todoUpdated"),
      };
    case "delete":
      return {
        type: "warning",
        icon: Trash2,
        text: props.t("chat.todoDeleted"),
      };
    case "get":
    default:
      return null;
  }
});
</script>

<style scoped>
.todo-result-viewer {
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 12px;
  border: 1px solid var(--border-color);
}

.todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.todo-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.todo-icon {
  color: var(--color-accent);
}

.todo-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

.todo-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  width: 80px;
  height: 6px;
  background: var(--bg-primary);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
  background: var(--color-accent);
}

.progress-fill.completed {
  background: #22c55e;
}

.progress-fill.half {
  background: #f59e0b;
}

.progress-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 32px;
  text-align: right;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-item {
  background: var(--bg-primary);
  border-radius: 4px;
  padding: 10px;
  border-left: 3px solid transparent;
  transition: all 0.2s;
}

.todo-item.pending {
  border-left-color: var(--text-secondary);
}

.todo-item.inProgress {
  border-left-color: #f59e0b;
  background: rgba(245, 158, 11, 0.05);
}

.todo-item.completed {
  border-left-color: #22c55e;
  opacity: 0.8;
}

.todo-item.completed .todo-content {
  text-decoration: line-through;
  color: var(--text-secondary);
}

.todo-main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.todo-status-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.todo-status-icon.pending {
  color: var(--text-secondary);
}

.todo-status-icon.inProgress {
  color: #f59e0b;
}

.todo-status-icon.completed {
  color: #22c55e;
}

.spinning {
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

.todo-content {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
  flex: 1;
}

.todo-children {
  margin-top: 8px;
  margin-left: 22px;
  padding-left: 12px;
  border-left: 2px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.todo-child-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 3px;
  background: var(--bg-secondary);
}

.todo-child-item.inProgress {
  background: rgba(245, 158, 11, 0.1);
}

.todo-child-item.completed {
  opacity: 0.7;
}

.todo-child-item.completed .todo-content {
  text-decoration: line-through;
  color: var(--text-secondary);
  font-size: 11px;
}

.todo-child-item .todo-content {
  font-size: 11px;
}

.todo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.todo-operation {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.operation-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.operation-badge.success {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.operation-badge.info {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.operation-badge.warning {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
</style>
