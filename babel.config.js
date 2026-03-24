module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      "nativewind/babel",
      [
        "module-resolver",
        {
          root: ["./src"],
          alias: {
            "@": "./src",
            "@assets": "./assets",
            "@components": "./src/components",
            "@screens": "./src/screens",
            "@services": "./src/services",
            "@api": "./src/api",
            "@stores": "./src/stores",
            "@hooks": "./src/hooks",
            "@constants": "./src/constants",
            "@utils": "./src/utils",
          },
        },
      ],
    ],
  };
};