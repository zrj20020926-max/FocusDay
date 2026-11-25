import { describe, expect, it } from 'vitest'
import { parseNativeAuthUrl } from './nativeAuth'

describe('Android auth callback', () => {
  it('accepts only the app account path and distinguishes password recovery', () => {
    expect(parseNativeAuthUrl('com.focusday.app://auth/account?code=example-auth-code'))
      .toEqual({ code: 'example-auth-code', recoverPassword: false })
    expect(parseNativeAuthUrl('com.focusday.app://auth/account?mode=update-password&code=example-auth-code'))
      .toEqual({ code: 'example-auth-code', recoverPassword: true })
    expect(parseNativeAuthUrl('com.focusday.app://auth/account?error=access_denied'))
      .toEqual({ failed: true })
  })

  it.each([
    'not a URL',
    'https://auth/account?code=example',
    'com.focusday.app://unexpected/account?code=example',
    'com.focusday.app://auth/tasks?code=example',
    'com.focusday.app://auth/account#access_token=example',
    'com.focusday.app://auth/account?code=one&code=two',
    'com.focusday.app://user@auth/account?code=example',
    'com.focusday.app://auth/account?mode=update-password',
  ])('ignores unrelated or invalid links (%s)', url => {
    expect(parseNativeAuthUrl(url)).toBeNull()
  })
})
