export interface FullscreenDocument {
  fullscreenEnabled?: boolean
  fullscreenElement?: Element | null
  exitFullscreen?: () => Promise<void>
  addEventListener(type: 'fullscreenchange', listener: EventListener): void
  removeEventListener(type: 'fullscreenchange', listener: EventListener): void
}

export class FullscreenError extends Error {
  constructor(message: string, public readonly code: 'UNSUPPORTED' | 'REJECTED') { super(message); this.name = 'FullscreenError' }
}

export class FullscreenService {
  constructor(private readonly targetDocument: FullscreenDocument = document) {}

  get active(): boolean { return Boolean(this.targetDocument.fullscreenElement) }

  async enter(element: Element): Promise<void> {
    const target = element as Element & { requestFullscreen?: () => Promise<void> }
    if (!this.targetDocument.fullscreenEnabled || !target.requestFullscreen) throw new FullscreenError('当前浏览器不支持全屏模式', 'UNSUPPORTED')
    try { await target.requestFullscreen() }
    catch { throw new FullscreenError('浏览器拒绝进入全屏，请检查权限后重试', 'REJECTED') }
  }

  async exit(): Promise<void> {
    if (!this.targetDocument.fullscreenElement || !this.targetDocument.exitFullscreen) return
    try { await this.targetDocument.exitFullscreen() }
    catch { throw new FullscreenError('退出全屏失败，请按 Esc 重试', 'REJECTED') }
  }

  subscribe(listener: () => void): () => void {
    const handler: EventListener = () => listener()
    this.targetDocument.addEventListener('fullscreenchange', handler)
    return () => this.targetDocument.removeEventListener('fullscreenchange', handler)
  }
}
