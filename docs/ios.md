# iOS 兼容准备

Focus Day 的 iOS Bundle Identifier 为 `com.focusday.app`。项目将 Capacitor iOS、Core、CLI 和 Android 固定为 7.6.10。iOS 项目使用 CocoaPods 解析原生插件，应用部署目标为 iOS 16.4，覆盖现有 UI 所需的 WebKit 对话框、动态视口和 CSS API。

## 在 Mac 上生成并运行

1. 安装 Node.js 20.19+、完整 Xcode 16+ 和 CocoaPods。在 Xcode 完成首次启动配置，确认 `xcodebuild -version`、`xcode-select -p` 和 `pod --version` 正常。日后提交 App Store 时按 Apple 当时要求选择 Xcode 和 SDK 版本。
2. 在仓库根目录执行下列命令。用本地 `.env.local` 或 `.env.ios.local` 提供 Supabase HTTPS URL 和 Publishable Key。无云端配置时可以使用访客模式。

   ```sh
   npm ci
   npm run ios:sync
   open ios/App/App.xcworkspace
   ```

3. 第一次同步会生成 `ios/`、配置显示名称、回调 scheme、状态栏，复用项目占位图标并复制两项原生资源。在 Xcode 的 App target 中添加 `ios/App/App/PrivacyInfo.xcprivacy` 和 `ios/App/App/focus_day_chime.wav`，确认 **Build Phases → Copy Bundle Resources** 中各有一项。文件已位于项目目录，可取消再次复制。
4. 打开 App target，核对 Bundle Identifier、iOS 16.4 和版本号，先选 iPhone 模拟器运行。真机调试时在 **Signing & Capabilities** 选择自己的开发团队，保留项目 Bundle Identifier。模拟器编译也可使用下列命令。

   ```sh
   xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
     -configuration Debug -destination 'generic/platform=iOS Simulator' \
     CODE_SIGNING_ALLOWED=NO build
   ```

5. 后续修改 Web 代码后重新执行 `npm run ios:sync`。如果第一次创建中断但 Xcode 工程已生成，可执行 `npm run ios:sync -- --prepare` 补齐显示名、状态栏、回调和资源，必要时在 Xcode 和 Podfile 核对 16.4。默认同步会保留开发者后续修改的原生资源。

Windows 可执行 `npm run build:ios` 做 TypeScript 和 Vite 检查，输出 `dist-ios/`。Web 构建继续生成 PWA。iOS 和 Android 使用各自的打包目录，原生应用使用本地 Web 资源并禁用 PWA 注册。请用 `npm run ios:sync` 同步 iOS，该脚本为 Capacitor 选择正确的打包目录。

## 插件与权限

| 模块 | 当前准备和验收点 |
| --- | --- |
| SQLite 7.0.3 | iOS Podspec 依赖 SQLCipher 和 ZIPFoundation。沿用账号范围、事务和迁移，数据库位于沙盒 `Library/CapacitorDatabase`。业务库当前以非加密方式打开。验证 Xcode Pod 链接、升级和 A/B 账户隔离。 |
| Secure Storage 7.1.3 | 使用 Keychain 的 `whenUnlockedThisDeviceOnly` 存放会话和 PKCE 校验材料。验证解锁后冷启动、会话恢复、密码重置和退出；签名团队变化会影响 Keychain 的可用范围。 |
| App 7.1.2 | 生命周期恢复时重新计算计时，并唤醒通知检查与同步。iOS 左缘右滑先关闭键盘或浮层，再返回历史路由；列表行保留自己的滑动区域。 |
| Local Notifications 7.0.7 | 用户在设置主动开启后，由 iOS 系统弹出通知授权。拒绝后保留应用内提示，用户可在系统设置重新开启。iOS 本地通知无需额外的 Info.plist 用途描述或推送 entitlement。沿用调度上限，优先计时事件。专注、休息、任务和习惯共用打包提示音，系统专注模式和通知设置可能影响呈现。 |
| Status Bar 7.0.6 | `UIViewControllerBasedStatusBarAppearance=YES`，随主题和全屏更新图标明暗。页面、底部导航和抽屉由 CSS 安全区域管理，键盘使用 VisualViewport。 |
| Filesystem 7.1.9 / Share 7.0.4 | 导出在缓存中生成 UTF-8 JSON，经系统分享面板选择「存储到文件」，分享结束清理临时副本。恢复沿用 iOS 文件选择器、备份校验和确认流程。无需开启整个应用 Documents 目录的共享。Privacy Manifest 包含 Filesystem 要求的文件时间戳理由 `C617.1`。上架前仍需按实际部署核查数据披露与第三方 SDK 清单。 |
| 音频与沉浸模式 | WebAudio 由用户触摸启用。iOS 进入非活跃状态时释放环境音，返回后可点「播放已选声音」。沉浸界面在 WKWebView 不提供元素全屏时使用应用内覆盖层，仍保留退出入口。 |

## Supabase 原生认证回调

邮箱注册确认和重置密码沿用同设备 PKCE。iOS 的 `Info.plist` 注册 `com.focusday.app` URL scheme。Capacitor 模板的 AppDelegate 将 URL 交给 `ApplicationDelegateProxy`，应用通过 `getLaunchUrl` 和 `appUrlOpen` 接收冷启动与运行中的链接，只接受指定账号路由上的单个授权码。保持 AppDelegate 的 URL 转发。

在目标 Supabase 项目的 **Authentication → URL Configuration → Redirect URLs** 添加以下两项，并确认认证邮件模板保留 Supabase 生成的确认链接及重定向目标。

- `com.focusday.app://auth/account`
- `com.focusday.app://auth/account?mode=update-password`

Web 的 HTTPS `/account` 仍单独配置。项目当前提供邮箱密码认证，尚未接入 OAuth 提供商。将来若启用 OAuth，应由系统认证浏览器打开授权页并使用同一 PKCE 原生回调。若改用 Universal Links，需先确定正式 HTTPS 域名，再配置 Associated Domains 的 `applinks:<正式域名>`、在该域名发布 AASA 文件并限制为指定回调路径，同时更新应用允许的 HTTPS host/path 和 Supabase Redirect URLs。 [Supabase 原生认证文档](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)

## iOS 真机验收清单

- iPhone 竖屏和横屏、iPad、深色主题、刘海和 Home Indicator。检查任务抽屉、习惯弹窗、键盘弹出与关闭、左缘返回和列表滑动。
- 首次安装后离线创建任务、打卡和完成专注。重启应用检查 SQLite 恢复、统计与账号隔离，升级时验证原有记录。
- 三种计时模式、锁屏、切后台、冷启动恢复。通知分别验证允许与拒绝、静音、通知点击和通知到达后专注记录去重。
- 真实 Supabase 邮件注册和密码重置，分别测试应用在运行中和已退出。核对 PKCE 交换、登录恢复与重连同步。
- 白噪音首次手势、混音、来电或锁屏后的恢复。检查沉浸覆盖层退出。
- 在「文件」中导出和恢复备份。检查取消分享、尤其是 iPad 上的分享面板，以及格式错误或其他账号备份的拒绝行为。

当前 Windows 环境可以验证 Web 资源和共享代码。Xcode 编译、iOS 模拟器与 iPhone 上的原生运行仍需分别验收。
