import { reactive } from "vue";

export interface PromptOptions {
  title: string;
  message?: string;
  value?: string;
  placeholder?: string;
  okText?: string;
  cancelText?: string;
  /** Confirm dialogs render a red primary button. */
  danger?: boolean;
}

type PromptResolver = (value: string | null) => void;

export const dialogState = reactive({
  visible: false,
  withInput: false,
  title: "",
  message: "",
  value: "",
  placeholder: "",
  okText: "",
  cancelText: "",
  danger: false,
  resolver: null as PromptResolver | null,
});

export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    dialogState.visible = true;
    dialogState.withInput = true;
    dialogState.title = opts.title;
    dialogState.message = opts.message ?? "";
    dialogState.value = opts.value ?? "";
    dialogState.placeholder = opts.placeholder ?? "";
    dialogState.okText = opts.okText ?? "";
    dialogState.cancelText = opts.cancelText ?? "";
    dialogState.danger = false;
    dialogState.resolver = resolve as PromptResolver;
  });
}

export function confirmDialog(opts: PromptOptions): Promise<boolean | null> {
  return new Promise((resolve) => {
    dialogState.visible = true;
    dialogState.withInput = false;
    dialogState.title = opts.title;
    dialogState.message = opts.message ?? "";
    dialogState.value = "";
    dialogState.placeholder = "";
    dialogState.okText = opts.okText ?? "";
    dialogState.cancelText = opts.cancelText ?? "";
    dialogState.danger = opts.danger ?? false;
    dialogState.resolver = (v) => resolve(v === null ? null : v !== null && v !== "");
  });
}

export function settleDialog(result: string | null): void {
  if (!dialogState.visible) return;
  const resolver = dialogState.resolver;
  dialogState.visible = false;
  dialogState.resolver = null;
  resolver?.(result);
}
