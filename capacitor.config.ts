import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.focusday.app',
  appName: 'Focus Day',
  webDir: process.env.FOCUS_DAY_NATIVE_TARGET === 'ios' ? 'dist-ios' : 'dist-android',
  // Capacitor's verbose bridge logging can include secure-storage arguments.
  loggingBehavior: 'none',
  android: {
    adjustMarginsForEdgeToEdge: 'auto',
    resolveServiceWorkerRequests: false,
    // Filesystem and Share implement the iOS backup path only.
    includePlugins: [
      '@aparajita/capacitor-secure-storage',
      '@capacitor-community/sqlite',
      '@capacitor/app',
      '@capacitor/local-notifications',
      '@capacitor/status-bar',
    ],
  },
  ios: {
    // The edge-to-edge web layout applies the safe-area insets with CSS.
    contentInset: 'never',
    allowsLinkPreview: false,
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
    },
  },
}

export default config
