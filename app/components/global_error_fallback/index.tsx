// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Clipboard from '@react-native-clipboard/clipboard';
import React from 'react';
import {defineMessages} from 'react-intl';
import {Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';

import {DEFAULT_LOCALE, getTranslations} from '@i18n';
import {dismissAllModals, dismissAllOverlays, resetToHome} from '@screens/navigation';
import EphemeralStore from '@store/ephemeral_store';
import {formatRuntimeErrorForClipboard, getLatestRuntimeError, setLatestRuntimeError} from '@utils/runtime_error_state';

const styles = {
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 40,
        paddingBottom: 24,
        backgroundColor: '#111315',
    },
    title: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '700' as const,
        marginBottom: 12,
    },
    description: {
        color: '#D3D6DB',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    detailBox: {
        flex: 1,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#2B2D31',
        backgroundColor: '#0C0D0E',
        padding: 12,
        marginBottom: 16,
    },
    detailText: {
        color: '#E1E3E8',
        fontSize: 12,
        lineHeight: 18,
    },
    actions: {
        flexDirection: 'row' as const,
        gap: 12,
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    primaryButton: {
        backgroundColor: '#2389D7',
    },
    secondaryButton: {
        backgroundColor: '#2B2D31',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600' as const,
    },
};

const messages = defineMessages({
    title: {
        id: 'global_error_fallback.title',
        defaultMessage: 'Something went wrong',
    },
    description: {
        id: 'global_error_fallback.description',
        defaultMessage: 'The app hit an unexpected error. You can copy details and send them for troubleshooting, or take a screenshot.',
    },
    copy: {
        id: 'global_error_fallback.copy',
        defaultMessage: 'Copy details',
    },
    copiedTitle: {
        id: 'global_error_fallback.copied_title',
        defaultMessage: 'Copied',
    },
    copiedDesc: {
        id: 'global_error_fallback.copied_desc',
        defaultMessage: 'Error details copied to clipboard.',
    },
    retry: {
        id: 'global_error_fallback.retry',
        defaultMessage: 'Retry',
    },
    goHome: {
        id: 'global_error_fallback.go_home',
        defaultMessage: 'Back to home',
    },
});

type FallbackProps = {
    error?: Error;
    onRetry: () => void;
};

const GlobalErrorFallback = ({error, onRetry}: FallbackProps) => {
    const locale = EphemeralStore.getCurrentLocale() || DEFAULT_LOCALE;
    const translations = getTranslations(locale);
    const t = (id: keyof typeof messages) => translations[messages[id].id] || messages[id].defaultMessage;

    const latest = getLatestRuntimeError();
    const message = formatRuntimeErrorForClipboard(
        latest ?? (error ? {
            source: 'react_boundary',
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        } : undefined),
    );

    const copyDetails = () => {
        Clipboard.setString(message);
        Alert.alert(t('copiedTitle'), t('copiedDesc'));
    };

    const goHome = async () => {
        await dismissAllModals();
        await dismissAllOverlays();
        await resetToHome();
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{t('title')}</Text>
            <Text style={styles.description}>
                {t('description')}
            </Text>
            <View style={styles.detailBox}>
                <ScrollView>
                    <Text
                        selectable={true}
                        style={styles.detailText}
                    >
                        {message}
                    </Text>
                </ScrollView>
            </View>
            <View style={styles.actions}>
                <TouchableOpacity
                    style={[styles.button, styles.secondaryButton]}
                    onPress={copyDetails}
                    activeOpacity={0.8}
                    testID='global_error_fallback.copy'
                >
                    <Text style={styles.buttonText}>{t('copy')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.button, styles.primaryButton]}
                    onPress={onRetry}
                    activeOpacity={0.8}
                    testID='global_error_fallback.retry'
                >
                    <Text style={styles.buttonText}>{t('retry')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.button, styles.secondaryButton]}
                    onPress={goHome}
                    activeOpacity={0.8}
                    testID='global_error_fallback.go_home'
                >
                    <Text style={styles.buttonText}>{t('goHome')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

type BoundaryProps = {
    children: JSX.Element;
};

type BoundaryState = {
    hasError: boolean;
    error?: Error;
};

export default class GlobalErrorBoundary extends React.PureComponent<BoundaryProps, BoundaryState> {
    constructor(props: BoundaryProps) {
        super(props);
        this.state = {hasError: false};
    }

    static getDerivedStateFromError(error: Error): BoundaryState {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error) {
        setLatestRuntimeError(error, 'react_boundary');
    }

    handleRetry = () => {
        this.setState({hasError: false, error: undefined});
    };

    render() {
        if (this.state.hasError) {
            return (
                <GlobalErrorFallback
                    error={this.state.error}
                    onRetry={this.handleRetry}
                />
            );
        }

        return this.props.children;
    }
}
