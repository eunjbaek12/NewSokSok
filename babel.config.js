module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    env: {
      production: {
        // 운영 빌드에서만 console.* 제거 (error/warn은 크래시 진단용으로 유지)
        plugins: [
          ["transform-remove-console", { exclude: ["error", "warn"] }],
        ],
      },
    },
  };
};
