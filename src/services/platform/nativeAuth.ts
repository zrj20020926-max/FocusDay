import { Capacitor } from '@capacitor/core'

export const NATIVE_AUTH_ORIGIN = 'com.focusday.app://auth'

export function authRedirectUrl(path: string): string | undefined {
  if (Capacitor.isNativePlatform()) return NATIVE_AUTH_ORIGIN + path
  return typeof window === 'undefined' ? undefined : window.location.origin + path
}

export function parseNativeAuthUrl(raw: string): { code: string; recoverPassword: boolean } | { failed: true } | null {
  const prefix = NATIVE_AUTH_ORIGIN + '/account?'
  // Android WebView versions differ in how URL.host treats non-HTTP schemes.
  if (!raw.startsWith(prefix) || raw.includes('#')) return null
  const query = new URLSearchParams(raw.slice(prefix.length))
  if (query.has('error') || query.has('error_code') || query.has('error_description')) return { failed: true }
  const codes = query.getAll('code')
  if (codes.length !== 1 || !/^[A-Za-z0-9._~-]{1,512}$/.test(codes[0])) return null
  return { code: codes[0], recoverPassword: query.get('mode') === 'update-password' }
}
