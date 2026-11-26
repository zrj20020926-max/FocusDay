import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

if (process.platform !== 'darwin') {
  console.error('iOS 工程同步需要 macOS、Xcode 和 CocoaPods。可在当前系统运行 npm run build:ios 验证 Web 资源。')
  process.exit(1)
}

const app = 'ios/App/App'
const project = 'ios/App/App.xcodeproj/project.pbxproj'
const plist = join(app, 'Info.plist')
const cli = 'node_modules/@capacitor/cli/bin/capacitor'
const cap = (...args) => execFileSync(process.execPath, [cli, ...args], {
  env: { ...process.env, FOCUS_DAY_NATIVE_TARGET: 'ios' },
  stdio: 'inherit',
})
const plutil = '/usr/bin/plutil'
const readKey = (key) => {
  const result = spawnSync(plutil, ['-extract', key, 'json', '-o', '-', plist], { encoding: 'utf8' })
  return result.status === 0 ? JSON.parse(result.stdout) : undefined
}
const writeKey = (key, value) => {
  const type = typeof value === 'boolean' ? '-bool' : typeof value === 'string' ? '-string' : '-json'
  const encoded = type === '-json' ? JSON.stringify(value) : String(value)
  const exists = spawnSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist]).status === 0
  execFileSync(plutil, [exists ? '-replace' : '-insert', key, type, encoded, plist])
}

const created = !existsSync(project)
if (created) {
  if (existsSync('ios')) throw new Error('ios/ 已存在，但无法找到 Capacitor Xcode 工程。请先检查目录。')
  cap('add', 'ios', '--packagemanager', 'CocoaPods')
  // The application uses dialog, dynamic viewport units and newer WebKit layout APIs.
  const podfile = 'ios/App/Podfile'
  writeFileSync(podfile, readFileSync(podfile, 'utf8').replace("platform :ios, '14.0'", "platform :ios, '16.4'"))
  writeFileSync(project, readFileSync(project, 'utf8').replaceAll('IPHONEOS_DEPLOYMENT_TARGET = 14.0;', 'IPHONEOS_DEPLOYMENT_TARGET = 16.4;'))
}

if (created || process.argv.includes('--prepare')) {
  writeKey('CFBundleDisplayName', 'Focus Day')
  writeKey('UIViewControllerBasedStatusBarAppearance', true)

  const types = readKey('CFBundleURLTypes') ?? []
  if (!types.some(type => type.CFBundleURLSchemes?.includes('com.focusday.app'))) {
    types.push({ CFBundleURLName: 'com.focusday.app.auth', CFBundleTypeRole: 'Editor', CFBundleURLSchemes: ['com.focusday.app'] })
    writeKey('CFBundleURLTypes', types)
  }

  const privacy = join(app, 'PrivacyInfo.xcprivacy')
  if (!existsSync(privacy)) copyFileSync('resources/ios/PrivacyInfo.xcprivacy', privacy)
  const chime = join(app, 'focus_day_chime.wav')
  if (!existsSync(chime)) copyFileSync('android/app/src/main/res/raw/focus_day_chime.wav', chime)

  if (created || process.argv.includes('--placeholder-icon')) {
    execFileSync('/usr/bin/sips', ['-z', '1024', '1024', 'public/icons/app-512.png', '--out',
      join(app, 'Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')])
  }
  execFileSync(plutil, ['-lint', plist, privacy], { stdio: 'inherit' })
  console.log('在 Xcode 的 App target 中添加 PrivacyInfo.xcprivacy 和 focus_day_chime.wav，并检查 Copy Bundle Resources。')
}

cap('sync', 'ios')
