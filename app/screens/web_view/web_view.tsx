// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {WebView} from 'react-native-webview';

import {useTheme} from '@context/theme';

type Props = {
    url: string;
    componentId: string;
    closeButtonId?: string;
}

const WebViewScreen = ({url}: Props) => {
    const theme = useTheme();
    const [loading, setLoading] = useState(true);

    return (
        <View style={styles.container}>
            <WebView
                source={{uri: url}}
                style={styles.webview}
                onLoadEnd={() => setLoading(false)}
                onLoadStart={() => setLoading(true)}
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
