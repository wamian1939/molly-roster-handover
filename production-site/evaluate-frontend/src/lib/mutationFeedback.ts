import { ApiRequestError } from "../services/apiClient";

export function mutationErrorMessage(reason: unknown, fallback: string) {
  if (reason instanceof ApiRequestError) {
    if (reason.status === 0) return "无法连接服务器，本次修改尚未保存。";
    if ([500, 502, 503, 504].includes(reason.status)) return "服务器暂时无法处理请求，本次修改尚未保存。";
    return reason.message;
  }
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
