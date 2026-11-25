import { Capacitor } from '@capacitor/core'

export async function applyNativeStatusBar(dark: boolean, background: string) {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('StatusBar')) return
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
  // Android 15 controls the edge-to-edge background. Older releases still use this color.
  if (/^#[0-9a-f]{6}$/i.test(background)) await StatusBar.setBackgroundColor({ color: background })
}
