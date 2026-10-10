#!/usr/bin/env node
/**
 * Makes Android Studio's Gradle sync work when a path contains a space
 * (for example a Windows user folder such as `C:\Users\First Last`).
 *
 * react-native-worklets, react-native-reanimated and expo-modules-core each
 * ship a sync-only helper, `generateStubPCH`, that writes placeholder
 * precompiled headers for the IDE's C++ indexer. The helpers pick the compiler
 * flags out of `compile_commands.json` by splitting on spaces, so a quoted
 * `--sysroot="C:/Users/First Last/..."` is cut in half and sync fails with
 * "Stub PCH generation failed: clang++: error: no such file or directory".
 *
 * Two changes, both limited to that helper (the real build never uses it):
 *   1. read a quoted `--sysroot` whole;
 *   2. report a stub that still cannot be made as a warning instead of failing
 *      the sync — the real build compiles the proper header anyway.
 *
 * Runs after every `npm install` (see "postinstall"); safe to run repeatedly.
 */

const fs = require('fs');
const path = require('path');

const MARK = 'patched by apps/mobile/scripts/patch-stub-pch.js';

function resolveFile(pkg, relative) {
  try {
    return path.join(path.dirname(require.resolve(`${pkg}/package.json`, { paths: [__dirname] })), relative);
  } catch {
    return null;
  }
}

/** [package, file, [[find, replace], ...]] */
const KTS_EDITS = [
  [
    'val sysroot = Regex("""--sysroot=\\S+""").find(command)!!.value',
    'val sysroot = Regex("""--sysroot=("[^"]+"|\\S+)""").find(command)!!.value.replace("\\"", "")',
  ],
  [
    'throw GradleException(\n                            "Stub PCH generation failed: ${process.inputStream.bufferedReader().readText()}",\n                        )',
    'logger.warn("Stub PCH not generated (IDE indexing only): ${process.inputStream.bufferedReader().readText()}")\n                        return@entry',
  ],
];
const TARGETS = [
  ['react-native-worklets', 'android/generate-stub-pch.gradle.kts', KTS_EDITS],
  ['react-native-reanimated', 'android/generate-stub-pch.gradle.kts', KTS_EDITS],
  [
    'expo-modules-core',
    'android/build.gradle',
    [
      [
        'throw new GradleException("Stub PCH generation failed: ${process.inputStream.text}")',
        'logger.warn("Stub PCH not generated (IDE indexing only): ${process.inputStream.text}")\n            return',
      ],
    ],
  ],
];

for (const [pkg, relative, edits] of TARGETS) {
  const file = resolveFile(pkg, relative);
  if (!file || !fs.existsSync(file)) {
    console.log(`[patch-stub-pch] ${pkg}: not installed, skipped`);
    continue;
  }
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(MARK)) {
    console.log(`[patch-stub-pch] ${pkg}: already patched`);
    continue;
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let applied = 0;
  for (const [find, replace] of edits) {
    const from = find.split('\n').join(eol);
    if (!text.includes(from)) continue;
    text = text.replace(from, () => replace.split('\n').join(eol));
    applied += 1;
  }
  if (applied !== edits.length) {
    // The library changed its helper; leave it alone rather than half-patch it.
    console.warn(`[patch-stub-pch] ${pkg}: helper looks different (${applied}/${edits.length} edits matched), not patched`);
    continue;
  }
  fs.writeFileSync(file, `// ${MARK}${eol}${text}`);
  console.log(`[patch-stub-pch] ${pkg}: patched`);
}
