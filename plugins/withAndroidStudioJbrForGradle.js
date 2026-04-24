const { withGradleProperties } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const JBR_CANDIDATES = [
  'C:/Program Files/Android/Android Studio/jbr',
  'C:/Program Files/Android/Android Studio Preview/jbr',
];

function findAndroidStudioJbr() {
  for (const root of JBR_CANDIDATES) {
    if (fs.existsSync(path.join(root, 'bin', 'java.exe'))) {
      return root.replace(/\\/g, '/');
    }
  }
  return null;
}

/** Pins Gradle to Android Studio's bundled JDK when present (stable CMake with RN; avoids Java 24 toolchain quirks on Windows). */
module.exports = function withAndroidStudioJbrForGradle(config) {
  const jbr = findAndroidStudioJbr();
  if (!jbr) {
    return config;
  }
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const key = 'org.gradle.java.home';
    const idx = props.findIndex((p) => p.type === 'property' && p.key === key);
    const entry = { type: 'property', key, value: jbr };
    if (idx >= 0 && props[idx].type === 'property') {
      props[idx].value = jbr;
    } else {
      props.push(entry);
    }
    return cfg;
  });
};
