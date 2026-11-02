// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {RUNNING_E2E} from '@env';
import TurboLogger from '@mattermost/react-native-turbo-log';
import {LogBox, Platform, UIManager} from 'react-native';
import ViewReactNativeStyleAttributes from 'react-native/Libraries/Components/View/ReactNativeStyleAttributes';
import 'react-native-gesture-handler';
import {Navigation} from 'react-native-navigation';

import './app/utils/bootstrap_text_scaling';
import {start} from './app/init/app';
import {logError, logInfo} from './app/utils/log';

declare const global: { HermesInternal: null | {} };

// Add scaleY back to work around its removal in React Native 0.70.
ViewReactNativeStyleAttributes.scaleY = true;

TurboLogger.configure({
    dailyRolling: false,
    logToFile: !__DEV__,
    maximumFileSize: 1024 * 1024,
    maximumNumberOfFiles: 2,
});

if (__DEV__) {
    LogBox.ignoreLogs([
        'new NativeEventEmitter',
    ]);

    // Ignore all notifications if running e2e
    const isRunningE2e = RUNNING_E2E === 'true';
    logInfo(`RUNNING_E2E: ${RUNNING_E2E}, isRunningE2e: ${isRunningE2e}`);
    if (isRunningE2e) {
        LogBox.ignoreAllLogs(true);
    }
}

if (global.HermesInternal) {
    // Polyfills required to use Intl with Hermes engine
    require('@formatjs/intl-getcanonicallocales/polyfill-force');
    require('@formatjs/intl-locale/polyfill-force');
    require('@formatjs/intl-pluralrules/polyfill-force');
    require('@formatjs/intl-numberformat/polyfill-force');
    require('@formatjs/intl-datetimeformat/polyfill-force');
    require('@formatjs/intl-datetimeformat/add-all-tz');
    require('@formatjs/intl-listformat/polyfill-force');
    require('@formatjs/intl-relativetimeformat/polyfill-force');
    require('@formatjs/intl-displaynames/polyfill-force');
}

if (Platform.OS === 'android') {
    const ShareExtension = require('share_extension/index.tsx').default;
    const AppRegistry = require('react-native/Libraries/ReactNative/AppRegistry');
    AppRegistry.registerComponent('MattermostShare', () => ShareExtension);
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

// 注册启动错误页面：当 start() 崩溃时替代原生 splash 显示，
// 避免用户在小米等特定设备上永远卡在白色启动页。
// 注意：index.ts 是 .ts 文件，不能使用 JSX，必须用 React.createElement。
Navigation.registerComponent('StartupError', () => {
    const React = require('react');
    const {View, Text, ScrollView, TouchableOpacity, BackHandler} = require('react-native');
    const h = React.createElement;

    const StartupError = ({error}: {error: string}) =>
        h(View, {style: {flex: 1, backgroundColor: '#fff', justifyContent: 'center', paddingHorizontal: 24}},
            h(Text, {style: {fontSize: 22, fontWeight: '700', color: '#E64340', textAlign: 'center', marginBottom: 16}},
                '应用启动失败'),
            h(ScrollView, {style: {maxHeight: 300, backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12}},
                h(Text, {style: {fontSize: 13, color: '#333', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'}},
                    error || 'Unknown error')),
            h(Text, {style: {fontSize: 14, color: '#666', textAlign: 'center', marginTop: 20, lineHeight: 20}},
                '请尝试以下操作：\n1. 完全关闭应用后重新打开\n2. 检查网络连接\n3. 在系统设置中清除应用缓存'),
            h(TouchableOpacity, {
                onPress: () => BackHandler.exitApp(),
                style: {marginTop: 24, backgroundColor: '#07C160', borderRadius: 8, paddingVertical: 12, alignItems: 'center'},
            },
                h(Text, {style: {color: '#fff', fontSize: 16, fontWeight: '600'}}, '退出应用')),
        );

    return StartupError;
});

const showStartupError = (errorMsg: string) => {
    try {
        Navigation.setRoot({
            root: {
                component: {
                    name: 'StartupError',
                    passProps: {error: errorMsg},
                    options: {
                        layout: {backgroundColor: '#fff'},
                        topBar: {visible: false},
                    },
                },
            },
        });
    } catch (fallbackError) {
        logError('[index] Failed to show error screen', fallbackError);
    }
};

Navigation.events().registerAppLaunchedListener(async () => {
    // 安全超时：如果 start() 30 秒内没有完成（卡在某个初始化步骤），
    // 强制显示错误页面，避免用户永远卡在原生 splash。
    let started = false;
    const safetyTimer = setTimeout(() => {
        if (!started) {
            logError('[index] start() did not complete within 30s — splash stuck safety net');
            showStartupError('应用启动超时（30秒），可能是网络连接问题或设备兼容性问题。\n\n请尝试关闭应用后重新打开，或检查网络设置。');
        }
    }, 30000);

    try {
        await start();
        started = true;
        clearTimeout(safetyTimer);
    } catch (error) {
        started = true;
        clearTimeout(safetyTimer);
        // start() 内部未捕获的异常会到这里；原生 splash 不会自动消失。
        // 记录错误并设置错误页面，让用户知道发生了什么，而不是永远卡在启动页。
        logError('[index] start() threw — attempting to show error screen', error);
        showStartupError(error instanceof Error ? `${error.message}\n\n${error.stack || ''}` : String(error));
    }
});
