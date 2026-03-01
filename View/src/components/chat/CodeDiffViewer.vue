<template>
  <div class="code-diff-viewer">
    <!-- 文件信息头部 -->
    <div class="diff-header">
      <div class="file-info">
        <FileCode :size="16" class="file-icon" />
        <span class="file-path">{{ fileName }}</span>
        <span v-if="lineInfo" class="line-info">({{ lineInfo }})</span>
      </div>
      <div class="diff-actions">
        <button
          v-if="hasDiff"
          class="action-btn"
          :class="{ active: showDiff }"
          @click="showDiff = !showDiff"
        >
          <GitCompare :size="14" />
          <span>{{ showDiff ? t("chat.hideDiff") : t("chat.showDiff") }}</span>
        </button>
        <button class="action-btn" @click="copyNewContent">
          <Copy :size="14" />
          <span>{{ t("chat.copy") }}</span>
        </button>
      </div>
    </div>

    <!-- 差异视图 -->
    <div v-if="hasDiff && showDiff" class="diff-content">
      <div class="diff-stats">
        <span class="stat added"
          >+{{ addedLines }} {{ t("chat.linesAdded") }}</span
        >
        <span class="stat removed"
          >-{{ removedLines }} {{ t("chat.linesRemoved") }}</span
        >
      </div>
      <div class="diff-lines">
        <div
          v-for="(line, index) in diffLines"
          :key="index"
          class="diff-line"
          :class="line.type"
        >
          <span class="line-number">{{
            line.oldLineNum || line.newLineNum || ""
          }}</span>
          <span class="line-marker">{{ line.marker }}</span>
          <span
            class="line-content"
            v-html="highlightCode(line.content)"
          ></span>
        </div>
      </div>
    </div>

    <!-- 新内容预览（简化视图） -->
    <div v-else-if="!showDiff && newContent" class="content-preview">
      <div class="preview-header">
        <span class="preview-label">{{ t("chat.newContent") }}</span>
      </div>
      <pre
        class="code-preview"
      ><code v-html="highlightCode(newContent)"></code></pre>
    </div>

    <!-- 创建文件视图 -->
    <div v-if="isCreateFile" class="create-file-info">
      <div class="info-badge success">
        <CheckCircle :size="14" />
        <span>{{ t("chat.fileCreated") }}</span>
      </div>
      <pre
        v-if="content"
        class="code-preview"
      ><code v-html="highlightCode(content)"></code></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { FileCode, GitCompare, Copy, CheckCircle } from "lucide-vue-next";
import { diffLines as computeDiff } from "diff";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";

hljs.registerLanguage("json", json);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("scss", css);

const props = defineProps<{
  filePath: string;
  oldContent?: string;
  newContent?: string;
  lineInfo?: string;
  isCreateFile?: boolean;
  content?: string;
  t: (key: string) => string;
}>();

const showDiff = ref(true);

// 从文件路径提取文件名
const fileName = computed(() => {
  const parts = props.filePath.split(/[\\/]/);
  return parts[parts.length - 1] || props.filePath;
});

// 判断是否有差异内容
const hasDiff = computed(() => {
  return !!props.oldContent && props.oldContent !== props.newContent;
});

// 计算差异
const diffResult = computed(() => {
  if (!hasDiff.value) return [];
  return computeDiff(props.oldContent || "", props.newContent || "", {
    newlineIsToken: false,
  });
});

// 解析行内容，提取行号和实际内容
const parseLineContent = (
  line: string
): { lineNum: number | null; content: string } => {
  const match = line.match(/^(\d+)→(.*)$/);
  if (match) {
    return { lineNum: parseInt(match[1]!, 10), content: match[2]! };
  }
  return { lineNum: null, content: line };
};

// 处理差异行
const diffLines = computed(() => {
  const lines: Array<{
    type: "added" | "removed" | "unchanged";
    content: string;
    marker: string;
    oldLineNum?: number;
    newLineNum?: number;
  }> = [];

  diffResult.value.forEach((part) => {
    const partLines = part.value
      .split("\n")
      .filter((_, i, arr) =>
        i < arr.length - 1 || part.value.endsWith("\n")
          ? true
          : part.value.length > 0
      );

    if (
      !part.value.endsWith("\n") &&
      part.value.length > 0 &&
      partLines.length === 0
    ) {
      partLines.push(part.value);
    }

    partLines.forEach((line) => {
      const { lineNum, content } = parseLineContent(line);

      if (part.added) {
        lines.push({
          type: "added",
          content: content,
          marker: "+",
          newLineNum: lineNum || undefined,
        });
      } else if (part.removed) {
        lines.push({
          type: "removed",
          content: content,
          marker: "-",
          oldLineNum: lineNum || undefined,
        });
      } else {
        lines.push({
          type: "unchanged",
          content: content,
          marker: " ",
          oldLineNum: lineNum || undefined,
          newLineNum: lineNum || undefined,
        });
      }
    });
  });

  return lines;
});

// 统计新增/删除行数
const addedLines = computed(() => {
  return diffLines.value.filter((l) => l.type === "added").length;
});

const removedLines = computed(() => {
  return diffLines.value.filter((l) => l.type === "removed").length;
});

// 代码高亮
const highlightCode = (code: string) => {
  if (!code) return "";

  // 尝试检测语言
  const ext = fileName.value.split(".").pop()?.toLowerCase();
  let lang = "";
  switch (ext) {
    case "ts":
    case "tsx":
      lang = "typescript";
      break;
    case "js":
    case "jsx":
      lang = "javascript";
      break;
    case "json":
      lang = "json";
      break;
    case "html":
    case "xml":
    case "vue":
      lang = "xml";
      break;
    case "css":
    case "scss":
    case "less":
      lang = "css";
      break;
  }

  if (lang && hljs.getLanguage(lang)) {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  }
  return hljs.highlightAuto(code).value;
};

// 复制新内容
const copyNewContent = () => {
  const content = props.isCreateFile ? props.content : props.newContent;
  if (content) {
    navigator.clipboard.writeText(content);
  }
};
</script>

<style scoped>
.code-diff-viewer {
  background: var(--bg-secondary);
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.file-icon {
  color: var(--color-accent);
  flex-shrink: 0;
}

.file-path {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-info {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.diff-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.action-btn.active {
  background: var(--color-accent);
  color: var(--color-bg);
  border-color: var(--color-accent);
}

.diff-content {
  max-height: 500px;
  overflow: auto;
  width: 100%;
}

.diff-stats {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
}

.stat {
  font-weight: 500;
}

.stat.added {
  color: #22c55e;
}

.stat.removed {
  color: #ef4444;
}

.diff-lines {
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  width: 100%;
  min-width: fit-content;
}

.diff-line {
  display: flex;
  align-items: flex-start;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-line.added {
  background: rgba(34, 197, 94, 0.1);
}

.diff-line.removed {
  background: rgba(239, 68, 68, 0.1);
}

.diff-line.unchanged {
  background: transparent;
}

.line-number {
  width: 50px;
  padding: 0 8px;
  text-align: right;
  color: var(--text-secondary);
  flex-shrink: 0;
  user-select: none;
}

.line-marker {
  width: 20px;
  text-align: center;
  flex-shrink: 0;
  font-weight: bold;
}

.diff-line.added .line-marker {
  color: #22c55e;
}

.diff-line.removed .line-marker {
  color: #ef4444;
}

.line-content {
  flex: 1;
  padding: 0 8px;
  min-width: 0;
}

.content-preview {
  padding: 12px;
}

.preview-header {
  margin-bottom: 8px;
}

.preview-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.code-preview {
  margin: 0;
  padding: 12px;
  background: var(--bg-code, #1e1e1e);
  color: var(--text-code, #d4d4d4);
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
}

.create-file-info {
  padding: 12px;
}

.info-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 12px;
}

.info-badge.success {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

/* 滚动条样式 */
.diff-content::-webkit-scrollbar,
.code-preview::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.diff-content::-webkit-scrollbar-track,
.code-preview::-webkit-scrollbar-track {
  background: transparent;
}

.diff-content::-webkit-scrollbar-thumb,
.code-preview::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.diff-content::-webkit-scrollbar-thumb:hover,
.code-preview::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
</style>
