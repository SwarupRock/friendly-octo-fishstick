/**
 * Pins the Gradle daemon to Java 17 for the generated Android project.
 *
 * Without this, Android Studio writes `gradle/gradle-daemon-jvm.properties`
 * for its own bundled runtime (Java 25), and the build then fails while
 * configuring the native modules with
 * "WARNING: A restricted method in java.lang.System has been called":
 * the Android Gradle plugin reads that Java 25 warning as an error.
 * React Native builds on Java 17, so Gradle is told to use an installed JDK 17.
 */

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withGradleJdk17(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'gradle');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'gradle-daemon-jvm.properties'),
        '# Written by plugins/with-gradle-jdk17.js - the Android build needs Java 17, not Android Studio\'s Java 25.\ntoolchainVersion=17\n',
      );
      return cfg;
    },
  ]);
};
