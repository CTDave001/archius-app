// Entry wrapper: capture fatal JS errors during startup and show them on
// screen instead of letting React Native abort the process.
//
// Context: App Review rejected build 9 with two SIGABRT crash logs, both
// <1s after launch, both ending in RCTExceptionsManager.reportFatal — the
// signature of ANY unhandled JS exception in a release build. The .ips logs
// don't contain the JS message, so this wrapper converts a hard crash into
// a readable on-screen error (and keeps the app alive when possible).

function describeError(e) {
  if (!e) return 'Unknown error';
  const msg = typeof e === 'string' ? e : e.message || String(e);
  const stack = e && e.stack ? String(e.stack).split('\n').slice(0, 10).join('\n') : '';
  return msg + (stack ? '\n\n' + stack : '');
}

let fatalShown = false;

function registerFallbackRoot(text) {
  try {
    const React = require('react');
    const { AppRegistry, ScrollView, Text, View } = require('react-native');
    const Screen = () =>
      React.createElement(
        View,
        { style: { flex: 1, backgroundColor: '#FAF8F3', paddingTop: 80 } },
        React.createElement(
          ScrollView,
          { style: { paddingHorizontal: 24 } },
          React.createElement(
            Text,
            { style: { fontSize: 20, fontWeight: '600', color: '#1F4458', marginBottom: 12 } },
            'Archius hit a startup error'
          ),
          React.createElement(
            Text,
            {
              selectable: true,
              style: { fontSize: 13, color: '#36404A', lineHeight: 18 },
            },
            text
          )
        )
      );
    AppRegistry.registerComponent('main', () => Screen);
  } catch {
    // nothing left to do — let the default behavior take over
  }
}

// Fatal errors reported through ErrorUtils are what end in
// RCTExceptionsManager.reportFatal → SIGABRT in release builds. Swallow the
// fatal flag and surface the message instead.
if (global.ErrorUtils && typeof global.ErrorUtils.setGlobalHandler === 'function') {
  const prevHandler =
    typeof global.ErrorUtils.getGlobalHandler === 'function'
      ? global.ErrorUtils.getGlobalHandler()
      : null;
  global.ErrorUtils.setGlobalHandler((err, isFatal) => {
    if (isFatal) {
      if (!fatalShown) {
        fatalShown = true;
        try {
          const { Alert } = require('react-native');
          Alert.alert('Startup error', describeError(err).slice(0, 1200));
        } catch {}
      }
      return; // do NOT forward — the default fatal handler aborts the process
    }
    if (prevHandler) prevHandler(err, isFatal);
  });
}

try {
  require('expo-router/entry');
} catch (e) {
  // A module-scope throw anywhere in the import graph lands here. Show it.
  registerFallbackRoot(describeError(e));
}
