import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

/**
 * 原生下拉的统一薄封装。
 * 选择规则：短枚举/本地字段用 NativeSelect；≥6 项或需要搜索再引入带 typeahead 的控件；
 * 提交一个动作时用 Menu；不要在 Modal 里放选择器。
 */
export function NativeSelect({ className, ...props }: ComponentPropsWithoutRef<"select">) {
  return <select {...props} className={cn("ui-select", className)} data-slot="native-select" />;
}
