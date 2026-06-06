// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * AI Agent 页面
 * 使用 WebView 内嵌 https://ai.optibot.cn:8065/plugins/com.mattermost.aiagent/ 网页
 */

import React, {useState} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';

import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme} from '@utils/theme';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    loadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.centerChannelBg,
        zIndex: 10,
    },
}));

const DEEPSEEK_URL = 'https://ai.optibot.cn:8065/plugins/com.mattermost.aiagent/';

const AIAgent = () => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const [isLoading, setIsLoading] = useState(true);

    /**
     * 网页开始加载时的回调
     */
    const onLoadStart = () => {
        setIsLoading(true);
    };

    /**
     * 网页加载完成时的回调
     */
    const onLoadEnd = () => {
        setIsLoading(false);
    };

    return (
        <SafeAreaView style={styles.container}>
            <WebView
                source={{uri: DEEPSEEK_URL}}
                style={{flex: 1}}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                onLoadStart={onLoadStart}
                onLoadEnd={onLoadEnd}
                startInLoadingState={false}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
            />
            {isLoading && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            )}
        </SafeAreaView>
    );
};

export default AIAgent;
