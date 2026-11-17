import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.drsalehfathullah.sportsmed',
  appName: 'Dr. Saleh Fathullah',
  webDir: 'dist',
  android: {
    backgroundColor: '#182A5C',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#1E7FC2',
    },
  },
};

export default config;
