import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.focusday.app',
  appName: 'Focus Day',
  webDir: 'dist-android',
  android: {
    adjustMarginsForEdgeToEdge: 'auto',
    resolveServiceWorkerRequests: false,
  },
}

export default config
