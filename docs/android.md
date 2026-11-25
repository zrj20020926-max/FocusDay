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

## Supabase 和邮件链接

`.env.local` 中的两个公开变量会用于两个构建，Android 可以用被 Git 忽略的 `.env.android.local` 覆盖。Android 的 Supabase URL 使用 HTTPS，仅允许 Publishable Key 或旧版 anon key。Secret、Service Role Key、SDK 私有路径、签名文件和生成的 Web assets 都应留在本机。

Android 的密码登录仍使用现有账号服务。注册确认和密码重置邮件通过 PKCE 授权码返回发起请求的 App 安装。在正式联调前，将下列地址添加到 Supabase Auth 的 Redirect URLs，并验证邮件模板保留 Supabase 的确认链接及其重定向目标。

- `com.focusday.app://auth/account`
- `com.focusday.app://auth/account?mode=update-password`

生产 Web 域名的 `/account` 仍需按 Web 部署分别配置。开发阶段通过自定义 scheme 接收链接，仅处理指定账号路由。生产阶段可评估绑定正式 HTTPS 域名的 Android App Links。

参考 [Capacitor 7 环境要求](https://capacitorjs.com/docs/v7/getting-started/environment-setup) 和 [Supabase 移动端认证链接](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)。
