// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import DatabaseManager from '@database/manager';
import {debugLog} from '@store/debug_log';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';

const MAX_RETRY = 3;
const RETRY_DELAY = 5000;

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 400, 'SemiBold'),
        flex: 1,
        textAlign: 'center',
        marginRight: 40,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'Regular'),
        marginTop: 12,
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    errorIcon: {
        marginBottom: 16,
    },
    errorTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 400, 'SemiBold'),
        marginBottom: 8,
        textAlign: 'center',
    },
    errorMessage: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'Regular'),
        textAlign: 'center',
        marginBottom: 16,
    },
    retryButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingHorizontal: 24,
        paddingVertical: 10,
    },
    retryText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    retryHint: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        ...typography('Body', 75, 'Regular'),
        marginTop: 8,
    },
    webview: {
        flex: 1,
    },
}));

type Props = {
    navigation: StackNavigationProp<any>;
};

type ErpCredentials = {
    api_key: string;
    api_secret: string;
    erp_url: string;
    error?: string;
};

const ErpDeskScreen = ({navigation}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);
    const webviewRef = useRef<WebView>(null);

    const [credentials, setCredentials] = useState<ErpCredentials | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [webviewLoading, setWebviewLoading] = useState(true);
    const [webviewError, setWebviewError] = useState('');
    const [retryCount, setRetryCount] = useState(0);
    const [reloadKey, setReloadKey] = useState(0);

    // Fetch ERP credentials
    useEffect(() => {
        const fetchCredentials = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const teamId = await getCurrentTeamId(database);
                const client = NetworkManager.getClient(serverUrl);
                const params = teamId ? `?team_id=${teamId}` : '';
                const url = `/plugins/com.mattermost.frappe-sync/api/erp/credentials${params}`;
                debugLog('[ERP]', `Fetching credentials: ${url}, teamId: ${teamId}`);
                const data = await client.doFetch(url, {method: 'get'});
                debugLog('[ERP]', `Response: ${JSON.stringify(data)}`);
                if (data?.error) {
                    debugLog('[ERP]', `Server error: ${data.error}`);
                    setError(data.error === 'no_token' ? 'no_token' : data.error);
                } else {
                    setCredentials(data);
                }
            } catch (e: any) {
                const errMsg = e?.message || String(e);
                const errDetails = e?.details ? JSON.stringify(e.details) : '';
                const errStatus = e?.status_code || e?.status || '';
                debugLog('[ERP]', `Fetch error: ${errMsg} | status: ${errStatus} | details: ${errDetails}`);
                setError(errMsg);
            } finally {
                setLoading(false);
            }
        };
        fetchCredentials();
    }, [serverUrl, intl]);

    // Auto-retry on webview error
    useEffect(() => {
        if (!webviewError || retryCount >= MAX_RETRY) {return;}
        const timer = setTimeout(() => {
            setRetryCount((c) => c + 1);
            setWebviewError('');
            setReloadKey((k) => k + 1);
        }, RETRY_DELAY);
        return () => clearTimeout(timer);
    }, [webviewError, retryCount]);

    const handleBack = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    const handleRetry = useCallback(() => {
        setRetryCount(0);
        setWebviewError('');
        setWebviewLoading(true);
        setReloadKey((k) => k + 1);
    }, []);

    const handleLoadEnd = useCallback(() => {
        setWebviewLoading(false);
    }, []);

    const handleLoadError = useCallback(() => {
        setWebviewError('Load failed');
    }, []);

    // Build ERP URL
    const erpUrl = credentials?.erp_url || 'https://erp.optibot.cn:8443';
    const deskUrl = erpUrl.replace(/\/$/, '') + '/desk';

    // Build auth headers for Frappe/ERPNext token auth
    const authHeaders: Record<string, string> = {};
    if (credentials?.api_key && credentials?.api_secret) {
        authHeaders.Authorization = `token ${credentials.api_key}:${credentials.api_secret}`;
    }

    // Loading state
    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'workspace.erp.title', defaultMessage: 'ERP'})}
                    </Text>
                </View>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                    <Text style={styles.loadingText}>
                        {intl.formatMessage({id: 'erp.desk.loading', defaultMessage: 'Connecting to ERP...'})}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    // No ERP access
    if (error === 'no_token') {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'workspace.erp.title', defaultMessage: 'ERP'})}
                    </Text>
                </View>
                <View style={styles.errorContainer}>
                    <CompassIcon name='lock-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)} style={styles.errorIcon}/>
                    <Text style={styles.errorTitle}>
                        {intl.formatMessage({id: 'erp.desk.no_access_title', defaultMessage: 'No ERP Access'})}
                    </Text>
                    <Text style={styles.errorMessage}>
                        {intl.formatMessage({id: 'erp.desk.no_access_msg', defaultMessage: 'Your account is not linked to the ERP system. Please contact your administrator.'})}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    // Other error
    if (error) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'workspace.erp.title', defaultMessage: 'ERP'})}
                    </Text>
                </View>
                <View style={styles.errorContainer}>
                    <CompassIcon name='alert-circle-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)} style={styles.errorIcon}/>
                    <Text style={styles.errorTitle}>
                        {intl.formatMessage({id: 'erp.desk.error_title', defaultMessage: 'Connection Failed'})}
                    </Text>
                    <Text style={styles.errorMessage}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                        <Text style={styles.retryText}>
                            {intl.formatMessage({id: 'erp.desk.retry', defaultMessage: 'Retry'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // WebView loading or error overlay
    const showOverlay = webviewLoading || webviewError;

    return (
        <SafeAreaView style={styles.container} edges={['top']} testID='erp_desk.screen'>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                    <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'workspace.erp.title', defaultMessage: 'ERP'})}
                </Text>
            </View>
            <View style={{flex: 1}}>
                <WebView
                    key={`erp-webview-${reloadKey}`}
                    ref={webviewRef}
                    source={{uri: deskUrl, headers: authHeaders}}
                    style={styles.webview}
                    onLoadStart={() => setWebviewLoading(true)}
                    onLoadEnd={handleLoadEnd}
                    onError={handleLoadError}
                    startInLoadingState={true}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    sharedCookiesEnabled={true}
                />
                {showOverlay && (
                    <View style={StyleSheet.absoluteFill}>
                        <View style={styles.loading}>
                            {webviewError ? (
                                <>
                                    <CompassIcon name='alert-circle-outline' size={36} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                                    <Text style={styles.loadingText}>
                                        {retryCount < MAX_RETRY
                                            ? intl.formatMessage({id: 'erp.desk.auto_retry', defaultMessage: 'Retrying... ({count}/{max})'}, {count: retryCount + 1, max: MAX_RETRY})
                                            : intl.formatMessage({id: 'erp.desk.webview_error', defaultMessage: 'Unable to connect to ERP'})}
                                    </Text>
                                    {retryCount >= MAX_RETRY && (
                                        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                                            <Text style={styles.retryText}>
                                                {intl.formatMessage({id: 'erp.desk.retry', defaultMessage: 'Retry'})}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            ) : (
                                <>
                                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                                    <Text style={styles.loadingText}>
                                        {intl.formatMessage({id: 'erp.desk.loading_page', defaultMessage: 'Loading ERP...'})}
                                    </Text>
                                </>
                            )}
                        </View>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
};

export default ErpDeskScreen;
