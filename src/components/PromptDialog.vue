<script setup lang="ts">
import { nextTick, watch, ref } from "vue";
import { t } from "@/lib/i18n";
import { dialogState, settleDialog } from "@/stores/dialog";
import { useDraggableCard } from "@/lib/dialogDrag";

const inputEl = ref<HTMLInputElement | null>(null);

const { cardStyle, onHeaderPointerDown, reset } = useDraggableCard();

// The component stays mounted in App.vue; re-center whenever it is dismissed
// so the next dialog opens in its default position.
watch(
  () => dialogState.visible,
  (visible) => {
    if (!visible) reset();
  }
);

watch(
  () => dialogState.visible,
  async (visible) => {
    if (visible && dialogState.withInput) {
      await nextTick();
      inputEl.value?.focus();
      inputEl.value?.select();
    }
  }
);

function ok(): void {
  if (dialogState.withInput && !dialogState.value.trim()) return;
  settleDialog(dialogState.withInput ? dialogState.value : "ok");
}

function cancel(): void {
  // Confirm mode distinguishes the explicit 不保存 button ("cancel") from
  // Esc dismissal (null = abort); prompts keep plain null.
  settleDialog(dialogState.withInput ? null : "cancel");
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    e.preventDefault();
    ok();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancel();
  }
}
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <!-- 遮罩层不响应点击：必须通过对话框内按钮（或 Esc）显式关闭，防止误触 -->
      <div v-if="dialogState.visible" class="prompt-overlay">
        <div class="prompt-panel" role="dialog" :style="cardStyle">
          <!-- 标题栏作为拖动把手，可拖动整个对话框 -->
          <h3 class="prompt-title" @pointerdown="onHeaderPointerDown">{{ dialogState.title }}</h3>
          <p v-if="dialogState.message" class="prompt-message">
            {{ dialogState.message }}
          </p>
          <input
            v-if="dialogState.withInput"
            ref="inputEl"
            v-model="dialogState.value"
            class="text-input prompt-input"
            type="text"
            :placeholder="dialogState.placeholder"
            spellcheck="false"
            @keydown="onInputKeydown"
          />
          <div class="prompt-actions">
            <button class="btn" @click="cancel">
              {{ dialogState.cancelText || t("dialog.cancel") }}
            </button>
            <button
              class="btn"
              :class="dialogState.danger ? 'danger' : 'primary'"
              :disabled="dialogState.withInput && !dialogState.value.trim()"
              @click="ok"
            >
              {{ dialogState.okText || t("dialog.ok") }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.prompt-overlay {
  position: fixed;
  inset: 0;
  z-index: 950;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.prompt-panel {
  width: 400px;
  max-width: calc(100vw - 48px);
  padding: 22px 24px 18px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-md);
  background: var(--bg-layer);
  box-shadow: var(--shadow-dialog);
}

.prompt-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 650;
  /* 标题栏 = 拖动把手 */
  cursor: grab;
  user-select: none;
}

.prompt-message {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  user-select: text;
}

.prompt-input {
  width: 100%;
  margin-top: 10px;
}

.prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
</style>
