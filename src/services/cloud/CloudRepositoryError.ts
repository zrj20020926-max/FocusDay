export class CloudRepositoryError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'CloudRepositoryError'
  }
}

export function assertUuid(id: string, label = '数据 ID'): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new CloudRepositoryError(`${label} 必须是 UUID；本地旧 ID 需由后续同步引擎建立映射`, 'validate-id')
  }
}
