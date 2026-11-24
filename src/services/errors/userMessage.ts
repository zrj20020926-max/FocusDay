export function toUserMessage(error: unknown, fallback = '操作暂时无法完成，请稍后重试'): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/jwt|token.*expired|session.*expired|not authenticated|未登录/i.test(message)) return '登录状态已过期，请重新登录后再试'
  if (/timeout|timed out|超时/i.test(message)) return '云端响应超时，本地数据已安全保留，请稍后重试'
  if (/fetch|network|offline|failed to connect/i.test(message)) return '当前网络不可用，本地功能仍可正常使用，联网后将自动重试'
  if (/quota|disk|storage.*full/i.test(message)) return '设备存储空间不足，请清理空间后重试'
  if (/indexeddb|database|数据库/i.test(message)) return '本地数据访问失败，请刷新页面后重试'
  if (/permission|row-level|rls|42501|权限/i.test(message)) return '当前账号没有执行此操作的权限'
  if (/conflict|版本.*变化|冲突/i.test(message)) return '检测到其他设备的更新，请同步后重试'
  return message && message.length <= 160 && !/\n| at |stack/i.test(message) ? message : fallback
}
