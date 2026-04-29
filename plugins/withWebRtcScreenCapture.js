const { AndroidConfig, withMainApplication } = require('expo/config-plugins');

/**
 * Enables react-native-webrtc screen capture on Android 10+ / 14 (MediaProjection foreground service).
 * @see https://github.com/react-native-webrtc/react-native-webrtc/blob/master/Documentation/AndroidInstallation.md#screen-sharing
 */
function withWebRtcMediaProjectionService(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  ]);

  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kotlin') {
      return cfg;
    }
    let contents = cfg.modResults.contents;
    if (contents.includes('enableMediaProjectionService')) {
      cfg.modResults.contents = contents;
      return cfg;
    }

    if (!contents.includes('com.oney.WebRTCModule.WebRTCModuleOptions')) {
      contents = contents.replace(
        'import expo.modules.ApplicationLifecycleDispatcher',
        'import com.oney.WebRTCModule.WebRTCModuleOptions\nimport expo.modules.ApplicationLifecycleDispatcher',
      );
    }

    contents = contents.replace(
      /(override fun onCreate\(\) \{)\s*\n(\s*super\.onCreate\(\))\s*\n/,
      `$1\n$2\n    WebRTCModuleOptions.getInstance().enableMediaProjectionService = true\n`,
    );

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withWebRtcMediaProjectionService;
