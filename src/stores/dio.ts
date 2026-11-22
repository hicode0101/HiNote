import { reactive } from "vue";

// ===== drawio 流程图编辑器的宿主侧状态 =====
// DrawioEditor.vue 在挂载时注册真正的导出执行器（drawio iframe 内渲染），
// EditorHeader.vue 的"导出 SVG / PNG"按钮通过 exportDio() 触发。这样导出
// 动作的 UI（按钮）与协议实现（iframe 桥接）解耦，组件层级互不依赖。

export const dio = reactive({
  /** 正在导出：按钮置灰 + 状态提示。 */
  exporting: false,
});

type DioFormat = "svg" | "png";
type DioExporter = (format: DioFormat) => Promise<void>;

let exporter: DioExporter | null = null;

/** DrawioEditor 挂载/卸载时注册与注销导出执行器。 */
export function registerDioExporter(fn: DioExporter | null): void {
  exporter = fn;
}

/** 从工具栏发起导出；组件未就绪或正在导出时忽略。 */
export async function exportDio(format: DioFormat): Promise<void> {
  if (!exporter || dio.exporting) return;
  dio.exporting = true;
  try {
    await exporter(format);
  } finally {
    dio.exporting = false;
  }
}
