<template>
  <div class="file-tree-wrap">
    <button
      v-for="node in flatNodes"
      :key="node.key"
      class="tree-row"
      :class="{ 'is-file': node.isFile, 'is-folder': !node.isFile }"
      :style="{ paddingLeft: `${node.depth * 16 + 8}px` }"
      @click="handleNodeClick(node)"
    >
      <ChevronRight
        v-if="!node.isFile"
        :size="14"
        class="tree-arrow"
        :class="{ 'is-expanded': node.isExpanded }"
      />
      <span v-else class="tree-arrow-placeholder" />
      <component :is="node.isFile ? FileText : Folder" :size="14" />
      <span class="tree-label">{{ node.label }}</span>
    </button>

    <div v-if="!flatNodes.length" class="empty-text">
      {{ emptyText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ChevronRight, FileText, Folder } from "lucide-vue-next";

interface TreeNode {
  name: string;
  fullPath: string;
  isFile: boolean;
  children: Map<string, TreeNode>;
}

interface FlatNode {
  key: string;
  label: string;
  fullPath: string;
  depth: number;
  isFile: boolean;
  isExpanded: boolean;
}

const props = withDefaults(
  defineProps<{
    files: string[];
    expandAll?: boolean;
    emptyText?: string;
  }>(),
  {
    expandAll: false,
    emptyText: "No files",
  }
);

const emit = defineEmits<{
  (e: "select", filePath: string): void;
}>();

const splitPath = (path: string) => path.split(/[\\/]+/).filter(Boolean);

const getDefaultExpandedFolders = (files: string[]) => {
  const rootFolders = new Set<string>();

  for (const filePath of files) {
    const parts = splitPath(filePath);
    if (parts.length > 1) {
      rootFolders.add(parts[0]!);
    }
  }

  return rootFolders;
};

const expandedFolders = ref<Set<string>>(new Set());

watch(
  () => props.files,
  (files) => {
    expandedFolders.value = getDefaultExpandedFolders(files);
  },
  { immediate: true }
);

const treeRoot = computed(() => {
  const root = new Map<string, TreeNode>();

  for (const filePath of props.files) {
    const parts = splitPath(filePath);
    if (!parts.length) {
      continue;
    }

    let current = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = index === parts.length - 1;
      const existing = current.get(part);

      if (existing) {
        current = existing.children;
        return;
      }

      const node: TreeNode = {
        name: part,
        fullPath: isLast ? filePath : currentPath,
        isFile: isLast,
        children: new Map<string, TreeNode>(),
      };

      current.set(part, node);
      current = node.children;
    });
  }

  return root;
});

const sortNodes = (nodes: TreeNode[]) =>
  nodes.sort((a, b) => {
    if (a.isFile !== b.isFile) {
      return a.isFile ? 1 : -1;
    }

    return a.name.localeCompare(b.name);
  });

const flattenTree = (
  nodes: Map<string, TreeNode>,
  depth: number
): FlatNode[] => {
  const result: FlatNode[] = [];
  const sorted = sortNodes(Array.from(nodes.values()));

  for (const node of sorted) {
    const isExpanded =
      props.expandAll || expandedFolders.value.has(node.fullPath);

    result.push({
      key: `${node.fullPath}-${depth}`,
      label: node.name,
      fullPath: node.fullPath,
      depth,
      isFile: node.isFile,
      isExpanded,
    });

    if (!node.isFile && isExpanded && node.children.size > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }

  return result;
};

const flatNodes = computed(() => flattenTree(treeRoot.value, 0));

const handleNodeClick = (node: FlatNode) => {
  if (node.isFile) {
    emit("select", node.fullPath);
    return;
  }

  const next = new Set(expandedFolders.value);
  if (next.has(node.fullPath)) {
    next.delete(node.fullPath);
  } else {
    next.add(node.fullPath);
  }
  expandedFolders.value = next;
};
</script>

<style scoped>
.file-tree-wrap {
  overflow-y: auto;
  max-height: 52vh;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding-right: 0.125rem;
}

.tree-row {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding-top: 0.375rem;
  padding-bottom: 0.375rem;
  border-radius: 4px;
  font-size: 0.8125rem;
  cursor: pointer;
}

.tree-row:hover {
  background: var(--bg-secondary);
}

.tree-row.is-folder {
  color: var(--text-secondary);
}

.tree-arrow {
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.tree-arrow.is-expanded {
  transform: rotate(90deg);
}

.tree-arrow-placeholder {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-text {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}
</style>
