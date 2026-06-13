// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
    server: {
        // RN 0.77 默认关闭；配合 start 脚本的 --client-logs 将 JS 日志转发到 Metro 终端
        forwardClientLogs: true,
    },
    transformer: {
        babelTransformerPath: require.resolve('react-native-svg-transformer/react-native'),
    },
    resolver: {
        ...defaultConfig.resolver,
        assetExts: defaultConfig.resolver.assetExts.filter((ext) => ext !== 'svg'),
        sourceExts: [...defaultConfig.resolver.sourceExts, 'svg'],
        extraNodeModules: {
            events: require.resolve('events'),
        },
    },
};

module.exports = mergeConfig(defaultConfig, config);
