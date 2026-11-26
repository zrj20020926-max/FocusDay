import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.focusday.app',
  appName: 'Focus Day',
  webDir: 'dist-android',
  // Capacitor's verbose bridge logging can include secure-storage arguments.
  loggingBehavior: 'none',
  android: {
    adjustMarginsForEdgeToEdge: 'auto',
    resolveServiceWorkerRequests: false,
  },
}

export default config
