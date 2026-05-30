// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const {loadDotEnvIfPresent} = require('./scripts/load-dotenv');

// Optional: repo-root .env (git-ignored). Missing file is OK — use shell env or code defaults.
loadDotEnvIfPresent();

// Inline Babel plugin: replaces __DEBUG_PANEL__ with a boolean literal at compile time.
// This enables Metro's Terser to eliminate dead branches via Dead Code Elimination (DCE).
// Set SHOW_DEBUG_PANEL=true in .env or shell/package.json scripts to enable the debug panel.
const debugPanelEnabled = process.env.SHOW_DEBUG_PANEL === '1' || process.env.SHOW_DEBUG_PANEL === 'true';
function debugPanelTransformPlugin() {
    return {
        visitor: {
            Identifier(path) {
                if (path.node.name === '__DEBUG_PANEL__') {
                    path.replaceWith({type: 'BooleanLiteral', value: debugPanelEnabled});
                }
            },
        },
    };
}

module.exports = {
    presets: [
        ['@babel/preset-env', {targets: {node: 'current'}}],
        'module:@react-native/babel-preset',
        '@babel/preset-typescript',
    ],
    plugins: [
        debugPanelTransformPlugin,
        '@babel/plugin-transform-runtime',
        ['@babel/plugin-proposal-decorators', {legacy: true}],
        ['@babel/plugin-transform-flow-strip-types'],
        ['@babel/plugin-proposal-class-properties', {loose: true}],
        ['module-resolver', {
            root: ['.'],
            alias: {
                '@actions': './app/actions',
                '@agents': './app/products/agents',
                '@assets': './dist/assets/',
                '@calls': './app/products/calls',
                '@client': './app/client',
                '@components': './app/components',
                '@constants': './app/constants',
                '@context': './app/context',
                '@database': './app/database',
                '@helpers': './app/helpers',
                '@hooks': './app/hooks',
                '@i18n': './app/i18n',
                '@init': './app/init',
                '@managers': './app/managers',
                '@playbooks': './app/products/playbooks',
                '@queries': './app/queries',
                '@screens': './app/screens',
                '@share': './share_extension',
                '@store': './app/store',
                '@telemetry': './app/telemetry',
                '@test': './test',
                '@typings': './types',
                '@utils': './app/utils',
                '@websocket': './app/client/websocket',
            },
        }],
        ['module:react-native-dotenv', {
            moduleName: '@env',
            // .env is optional; when absent, @env imports are undefined (allowUndefined).
            path: '.env',
            blacklist: null,
            whitelist: null,
            safe: false,
            allowUndefined: true,
        }],
        'react-native-reanimated/plugin',
    ],
    exclude: ['**/*.png', '**/*.jpg', '**/*.gif'],
};
