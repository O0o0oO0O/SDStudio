import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.sunho.SDStudio',
  appName: 'SDStudio',
  webDir: 'release/app/dist/renderer',
  server: {
    url: "http://192.168.0.118:1212",
    cleartext: true
  },
  android: { allowMixedContent: true },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
