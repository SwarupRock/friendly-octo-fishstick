/**
 * The security check Firebase requires before it texts a code.
 *
 * Firebase's reCAPTCHA only runs in a browser on one of the project's
 * authorised domains, so it is run in a WebView whose page claims the
 * project's own `authDomain`. It is normally invisible; when Google wants a
 * puzzle solved, it appears in this sheet. The resulting token goes to
 * `onToken` and is spent on exactly one SMS.
 */

import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { config } from '@/lib/config';
import { fonts, useTheme } from '@/lib/theme';

import { Dots, GhostButton } from './kit';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';

function page(): string {
  const firebase = JSON.stringify({
    apiKey: config.firebase.apiKey,
    authDomain: config.firebase.authDomain,
    projectId: config.firebase.projectId,
    appId: config.firebase.appId,
  }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;background:transparent}</style>
<script src="${SDK}/firebase-app-compat.js"></script>
<script src="${SDK}/firebase-auth-compat.js"></script>
</head><body><div id="recaptcha"></div><script>
  var post = function (message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); };
  var fail = function (error) { post({ type: 'error', message: String((error && error.message) || error) }); };
  try {
    firebase.initializeApp(${firebase});
    firebase.auth().useDeviceLanguage();
    var verifier = new firebase.auth.RecaptchaVerifier('recaptcha', { size: 'invisible' });
    verifier.verify().then(function (token) { post({ type: 'token', token: token }); }).catch(fail);
  } catch (error) { fail(error); }
</script></body></html>`;
}

export function PhoneCaptcha({
  visible, onToken, onError, onCancel,
}: {
  visible: boolean;
  onToken: (token: string) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const source = useMemo(
    () => ({ html: page(), baseUrl: `https://${config.firebase.authDomain}` }),
    [],
  );
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}>
          <View style={styles.head}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Dots />
              <Text style={{ color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 }}>Security check…</Text>
            </View>
            <GhostButton icon="x" onPress={onCancel} />
          </View>
          <WebView
            source={source}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            style={styles.web}
            onMessage={(event) => {
              try {
                const message = JSON.parse(event.nativeEvent.data);
                if (message.type === 'token' && message.token) onToken(message.token);
                else onError(message.message || 'The security check failed.');
              } catch {
                onError('The security check failed.');
              }
            }}
            onError={() => onError('The security check could not load. Check your internet and try again.')}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  sheet: { borderWidth: 1, borderRadius: 22, overflow: 'hidden', height: 560, maxHeight: '90%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  web: { flex: 1, backgroundColor: 'transparent' },
});
