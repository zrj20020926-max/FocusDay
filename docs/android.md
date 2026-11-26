# Focus Day Android 工程

Android 工程位于 `android/`。应用名为 Focus Day，应用 ID 为 `com.focusday.app`。Capacitor Core、CLI 和 Android 固定在 7.6.10，配套的 App 插件为 7.1.2。这条维护线支持项目当前的 Node.js 20；Capacitor 8 需要 Node.js 22。项目的 Vite 工具链要求 Node.js 20.19 或更高版本。

阶段 7.5 的 Debug APK 使用版本名 `1.0.1` 和版本号 `2`。

## 开发和启动

1. 安装 JDK 21、Android SDK Platform 35、Build Tools 34.0.0 和 Platform Tools。建议使用 Android Studio 2024.2.1 或更新版本。
2. 在当前终端配置 `JAVA_HOME` 指向 JDK 21，`ANDROID_HOME` 指向 SDK，或在 Android Studio 中选择 Gradle JDK 与 SDK。Android Studio 生成的 `android/local.properties` 只留在本机。
3. 在仓库根目录执行 `npm ci`、`npm run android:sync`、`npm run android:open`。也可以直接在 Android Studio 中打开 `android/` 目录，再选择设备运行。
4. 命令行 Debug 构建可在 `android/` 下执行 `.\gradlew.bat :app:assembleDebug`（PowerShell）或 `./gradlew :app:assembleDebug`。APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

工程使用 Gradle Wrapper 8.11.1 和 Android Gradle Plugin 8.7.2，最低 API 23，编译/目标 API 35。运行时使用设备的 Android System WebView。发布前请根据目标应用商店要求重新检查目标 API、版本号及签名配置，发布密钥不要加入 Git。

命令行构建需要包含 `jlink` 的完整 JDK 21。将 Debug APK 安装到一次性模拟器后，可设置 `ANDROID_SERIAL`（如 `emulator-5554`），并通过 `ADB_PATH` 指定 adb 或将 adb 加入当前终端的 PATH，然后运行 `node scripts/verify-android.mjs`。脚本检查实际 WebView 的页面与返回键，以及不接触线上账号的认证深链。

## 真机安装与验收

手机通过 USB 连接后，开启「开发者选项 → USB 调试」并在手机上确认授权。从项目根目录执行以下命令。若连接多台设备，在 `adb` 后加 `-s 设备序列号`。

```powershell
adb devices -l
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -W -n com.focusday.app/.MainActivity
```

也可将 APK 复制到手机，用文件管理器打开安装。如果系统提示已有安装的签名不匹配，先在旧版应用导出本地数据，再决定是否卸载旧版。卸载会清除该安装的本地数据。

| 场景 | 真机步骤与通过条件 |
| --- | --- |
| 启动和布局 | 检查桌面图标和名称。首次启动应进入今日页。切换五个底部导航，打开任务抽屉和新建表单。确认内容避开刘海、手势栏及键盘，返回键先收起键盘或弹层，再退出当前页面。 |
| 登录 | 在「我的 → 账号与云端」使用已授权的测试账号登录。强制停止后再打开，应恢复账号。正式验收时使用专用测试任务和习惯。 |
| 任务与离线 | 新建带截止日期的任务，编辑标题和日期，刷新后核对。开启飞行模式，继续创建和修改任务并重开 App。关闭飞行模式后删除一条测试任务。 |
| 三种计时 | 测试番茄钟启动、暂停、继续和自然进入休息。用正计时记录一段专注并手动结束。设置一分钟倒计时，检查自然完成。结束后在任务详情和统计页核对有效专注次数及时长。 |
| 习惯与白噪音 | 新建一项每日习惯，打卡并重开 App 核对，之后取消打卡。选择专注场景，播放雨声，调整音量并静音，确认实际声音变化。 |
| 原生通知与锁屏 | 在设置中主动开启系统通知和提示音。设一分钟倒计时并锁屏，核对通知、声音和解锁后的完成状态。分别拒绝通知权限和精确提醒权限，确认应用内提示或非精确调度。另设任务和习惯提醒到最近几分钟，核对通知出现。 |
| Supabase 同步 | 使用同一测试账号登录手机和另一设备。确认手机离线改动联网后上传，另一设备修改可以拉回，软删除在两端一致，重复同步后只有一条记录。 |

出现白屏或资源错误时，先更新 Android System WebView，再在 Android Studio Logcat 中按包名筛选。可用 `adb logcat -d -s AndroidRuntime` 检查崩溃。数据库异常时保留应用数据并记录屏幕提示。通知延迟时检查应用通知权限、渠道、省电设置和精确提醒状态。

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

- 系统时间拨回到已持久化的上次观测时间之前时，计时引擎会保持该时间下限。此时新启动的正计时可能暂时停在 `00:00`，直到设备时钟追上该时间。执行系统时间变更测试后，等待设备时钟追上再复测常规流程。

在一次性 Android API 35 模拟器上安装 Debug APK，设置 `ADB_PATH` 和 `ANDROID_SERIAL` 后运行 `node scripts/verify-android.mjs --background-timer`。脚本会设置模拟器的通知权限，执行锁屏、省电模式、强制停止、重启和系统时钟变更测试。物理 Android 设备、不同厂商的省电策略、真实远端多设备和 iOS 运行仍需独立验收。
