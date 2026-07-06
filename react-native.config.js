// react-native-watch-connectivity ships a broken Android stub (unimplemented
// codegen template) that fails compileDebugKotlin; the lib is iOS-only anyway.
module.exports = {
  dependencies: {
    'react-native-watch-connectivity': {
      platforms: {
        android: null,
      },
    },
  },
};
