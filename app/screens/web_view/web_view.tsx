// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {WebView} from 'react-native-webview';

import {useTheme} from '@context/theme';
import {debugLog} from '@store/debug_log';

type Props = {
    url: string;
    componentId: string;
    closeButtonId?: string;
}

const WebViewScreen = ({url}: Props) => {
    const theme = useTheme();
    const [loading, setLoading] = useState(true);

    debugLog('[WebView] Loading URL', {url});

    return (
        <View style={styles.container}>
            <WebView
                source={{uri: url}}
                style={styles.webview}
                onLoadEnd={() => {
                    debugLog('[WebView] Load end', {url});
                    setLoading(false);
                }}
                onLoadStart={() => {
                    debugLog('[WebView] Load start', {url});
                    setLoading(true);
                }}
                onNavigationStateChange={(navState) => {
                    debugLog('[WebView] Navigation state', {
                        url: navState.url,
                        title: navState.title,
                        loading: navState.loading,
                        canGoBack: navState.canGoBack,
                        canGoForward: navState.canGoForward,
                    });
                }}
                onError={(syntheticEvent) => {
                    const {nativeEvent} = syntheticEvent;
                    debugLog('[WebView] Load error', {
                        url: nativeEvent.url,
                        code: nativeEvent.code,
                        description: nativeEvent.description,
                    });
                }}
                onHttpError={(syntheticEvent) => {
                    const {nativeEvent} = syntheticEvent;
                    debugLog('[WebView] HTTP error', {
                        url: nativeEvent.url,
                        statusCode: nativeEvent.statusCode,
                        description: nativeEvent.description,
                    });
                }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
            />
            {loading && (
                <View style={[styles.loadingOverlay, {backgroundColor: theme.centerChannelBg}]}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    webview: {
        flex: 1,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default WebViewScreen;
