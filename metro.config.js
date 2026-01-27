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
    resolver: {
        extraNodeModules: {

            // 将 Node.js 核心模块映射到对应的 npm 包
            events: require.resolve('events'),

            // 其他可能需要的核心模块...
        },
    },
};

module.exports = mergeConfig(defaultConfig, config);
