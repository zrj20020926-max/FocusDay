# Focus Day Android 工程

Android 工程位于 `android/`。应用名为 Focus Day，应用 ID 为 `com.focusday.app`。Capacitor Core、CLI 和 Android 固定在 7.6.10，配套的 App 插件为 7.1.2。这条维护线支持项目当前的 Node.js 20；Capacitor 8 需要 Node.js 22。项目的 Vite 工具链要求 Node.js 20.19 或更高版本。

## 开发和启动

1. 安装 JDK 21、Android SDK Platform 35、Build Tools 34.0.0 和 Platform Tools。建议使用 Android Studio 2024.2.1 或更新版本。
2. 在当前终端配置 `JAVA_HOME` 指向 JDK 21，`ANDROID_HOME` 指向 SDK，或在 Android Studio 中选择 Gradle JDK 与 SDK。Android Studio 生成的 `android/local.properties` 只留在本机。
3. 在仓库根目录执行 `npm ci`、`npm run android:sync`、`npm run android:open`。也可以直接在 Android Studio 中打开 `android/` 目录，再选择设备运行。
4. 命令行 Debug 构建可在 `android/` 下执行 `.\gradlew.bat :app:assembleDebug`（PowerShell）或 `./gradlew :app:assembleDebug`。APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

工程使用 Gradle Wrapper 8.11.1 和 Android Gradle Plugin 8.7.2，最低 API 23，编译/目标 API 35。运行时使用设备的 Android System WebView。发布前请根据目标应用商店要求重新检查目标 API、版本号及签名配置，发布密钥不要加入 Git。

命令行构建需要包含 `jlink` 的完整 JDK 21。将 Debug APK 安装到一次性模拟器后，可设置 `ANDROID_SERIAL`（如 `emulator-5554`），并通过 `ADB_PATH` 指定 adb 或将 adb 加入当前终端的 PATH，然后运行 `node scripts/verify-android.mjs`。脚本检查实际 WebView 的页面与返回键，以及不接触线上账号的认证深链。

## Web 与 Android 构建

- `npm run build` 仍输出 `dist/` 和 Web PWA。
- `npm run build:android` 输出 `dist-android/`。Capacitor 将它同步到 Android 工程的本地 assets，WebView 通过 `https://localhost` 加载，不注册 PWA Service Worker。原生包更新走 Android 安装更新。
- Vue Router 保持 history 模式。Capacitor 会在应用内提供页面入口，Android 返回键先关闭当前浮层，再返回上一路由。在没有可返回页面时回到首页或最小化。
- Android 使用与浏览器分开的本地存储。原 Web 版的数据需要通过账号同步或 JSON 导入进入 Android。

## SQLite 与同步验收

原生 SQLite 使用 Capacitor Community SQLite 7.0.3。数据库版本由 `sqliteSchema.ts` 管理，先建表与索引，再按版本补充统计索引和唯一约束。应用升级时，同一安装中的旧 WebView IndexedDB 会按已绑定的账号迁入 SQLite；未绑定数据归入访客。原生认证使用 Secure Storage 7.1.3，SQLite 业务数据当前未启用数据库加密。

在隔离的 Android 模拟器上，可用模拟 Supabase 验证两账号切换、离线编辑重连、远端拉取、软删除和计时恢复。

1. 在另一终端运行 `node scripts/pwa-test-server.mjs --native`。
2. 临时设置 `VITE_SUPABASE_URL=https://focusday-fixture.test` 和 `VITE_SUPABASE_PUBLISHABLE_KEY=local-native-test-fixture`，运行 Android 同步与 Debug 构建并安装 APK。
3. 使用 `ANDROID_SERIAL` 和 `ADB_PATH` 指定该模拟器，运行 `node scripts/verify-android.mjs --sqlite-sync`。脚本把 WebView 的模拟请求转到本机测试服务器。
4. 清除临时环境变量，重新构建日常使用的 APK。

## Supabase 和邮件链接

`.env.local` 中的两个公开变量会用于两个构建，Android 可以用被 Git 忽略的 `.env.android.local` 覆盖。Android 的 Supabase URL 使用 HTTPS，仅允许 Publishable Key 或旧版 anon key。Secret、Service Role Key、SDK 私有路径、签名文件和生成的 Web assets 都应留在本机。

Android 的密码登录仍使用现有账号服务。注册确认和密码重置邮件通过 PKCE 授权码返回发起请求的 App 安装。在正式联调前，将下列地址添加到 Supabase Auth 的 Redirect URLs，并验证邮件模板保留 Supabase 的确认链接及其重定向目标。

- `com.focusday.app://auth/account`
- `com.focusday.app://auth/account?mode=update-password`

生产 Web 域名的 `/account` 仍需按 Web 部署分别配置。开发阶段通过自定义 scheme 接收链接，仅处理指定账号路由。生产阶段可评估绑定正式 HTTPS 域名的 Android App Links。

参考 [Capacitor 7 环境要求](https://capacitorjs.com/docs/v7/getting-started/environment-setup) 和 [Supabase 移动端认证链接](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)。

## 后台计时与原生提醒

- 开始、暂停、恢复和结束会先提交 SQLite 计时快照。前台刷新、恢复、云端快照读取和用户操作依次执行。回到前台或冷启动时，TimerService 根据持久化的 `endTime` 与当前时间补算经过的阶段。原生通知点击只负责打开路由，专注记录按计时来源去重。
- Capacitor App 生命周期在进入后台时停止计时界面刷新。在回到前台时重新校准计时、更新通知权限和同步。锁屏期间的提醒由 Android AlarmManager 投递，应用无需启动前台服务或常驻 JavaScript。
- 在「设置 → 通知提醒」开启系统通知。Android 13 及以上使用 `POST_NOTIFICATIONS`，Android 12 及以上的「精确提醒」由用户在系统设置中单独允许。精确提醒未获允许时使用非精确调度，系统通知未获允许时继续提供应用内提示。计时与任务习惯提醒分别有有声和静音渠道，任务和习惯标题不会写入锁屏通知。
- 番茄钟预排接下来三个阶段，倒计时预排一次，正计时没有预定结束提醒。习惯预排接下来七个本地日历日，任务和习惯合计只预排最近 56 条。退到后台前的已知设置会用于调度；其他设备的修改在本机同步后生效。系统时区改变后，前台会重新生成日历提醒。
- Android 重启并解锁后恢复仍在未来的提醒，已过期的阶段由应用打开时补算。若用户从系统设置强行停止应用，Android 会撤销该应用的闹钟。省电模式、勿扰模式、通知渠道设置和设备厂商限制均可能延迟或抑制提醒。计时恢复仍以 SQLite 的时间戳为准。
- 离线期间各设备可以独立计时。重新联网后沿用云端单账号活动计时约束和冲突处理，无法在离线时预先阻止其他设备开始。

在一次性 Android API 35 模拟器上安装 Debug APK，设置 `ADB_PATH` 和 `ANDROID_SERIAL` 后运行 `node scripts/verify-android.mjs --background-timer`。脚本会设置模拟器的通知权限，执行锁屏、省电模式、强制停止、重启和系统时钟变更测试。物理 Android 设备、不同厂商的省电策略、真实远端多设备和 iOS 运行仍需独立验收。
