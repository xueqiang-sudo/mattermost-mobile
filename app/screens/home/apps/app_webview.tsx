// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import React, {useCallback, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {type AppsStackParamList} from './apps_stack_param_list';
import {Screens} from '@constants';

type Props = {
    route: RouteProp<AppsStackParamList, typeof Screens.APPS_WEBVIEW>;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        backgroundColor: theme.sidebarBg,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
        textAlign: 'center',
        marginRight: 40,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    webview: {
        flex: 1,
    },
}));

const styles = StyleSheet.create({
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
    },
});

/**
 * App key to webapp URL path mapping.
 * These paths correspond to the webapp's workbench panel routes.
 */
const APP_URL_MAP: Record<string, string> = {
    hotproducts: '/workbench/hot-products',
    approvals: '/workbench/approvals',
    finance: '/workbench/finance',
    sales: '/workbench/sales',
    inventory: '/workbench/inventory',
    conversations: '/workbench/conversations',
    price_list: '/workbench/price-list',
    cloud_drive: '/workbench/cloud-drive',
    // knowledge_base: '/workbench/knowledge-base',
    notebook: '/workbench/notebook',
};

const AppWebView = ({route}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const webviewRef = useRef<WebView>(null);
    const [loading, setLoading] = useState(true);

    const {appKey, title} = route.params;
    const appPath = APP_URL_MAP[appKey] || `/workbench/${appKey}`;
    const fullUrl = `${serverUrl}${appPath}`;

    const handleBack = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    const handleLoadEnd = useCallback(() => {
        setLoading(false);
    }, []);

    const handleLoadStart = useCallback(() => {
        setLoading(true);
    }, []);

    const themeStyles = getStyleSheet(theme);

    return (
        <SafeAreaView style={themeStyles.flex} testID='app_webview.screen'>
            <View style={themeStyles.header}>
                <TouchableOpacity
                    style={themeStyles.backButton}
                    onPress={handleBack}
                    testID='app_webview.back_button'
                >
                    <CompassIcon
                        name='arrow-left'
                        size={24}
                        color={theme.sidebarHeaderTextColor}
                    />
                </TouchableOpacity>
                <Text style={themeStyles.headerTitle}>
                    {title}
                </Text>
            </View>
            <View style={themeStyles.flex}>
                <WebView
                    ref={webviewRef}
                    source={{uri: fullUrl}}
                    style={themeStyles.webview}
                    onLoadStart={handleLoadStart}
                    onLoadEnd={handleLoadEnd}
                    startInLoadingState={true}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                />
                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size='large' color={theme.buttonBg}/>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
};

export default AppWebView;
