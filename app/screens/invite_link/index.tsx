// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    Keyboard,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {doPing} from '@actions/remote/general';
import {login, userPwdLoginAPI} from '@actions/remote/session';
import {sendAccountCode, verifyAccountCode} from '@actions/remote/plugin_gateway';
import {fetchConfigAndLicense} from '@actions/remote/systems';
import Button from '@components/button';
import CompassIcon from '@components/compass_icon';
import FloatingTextInput from '@components/floating_input/floating_text_input_label';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {getAutoClient} from '@managers/network_manager';
import {prepareJPushAfterLogin} from '@init/launch';
import {resetToHome, popTopScreen} from '@screens/navigation';
import EphemeralStore from '@store/ephemeral_store';
import {getFullErrorMessage} from '@utils/errors';
import {checkPhoneRule, emailFormatUsername, formatPhone, isPhoneNumber, splitPhone} from '@utils/form-rule';
import {isEmail} from '@utils/helpers';
import {logError, logInfo} from '@utils/log';
import {canReceiveNotifications} from '@utils/push_proxy';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    serverUrl?: string;
};

/**
 * Parse invite ID from a pasted URL or raw invite ID.
 * Accepts:
 *   - Full URL: https://server/invite?id=abc123&type=internal
 *   - Partial URL: /invite?id=abc123
 *   - Just the ID: abc123
 */
function parseInviteFromUrl(input: string): {id: string; type: string; invited_by: string} | null {
    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    try {
        const urlStr = trimmed.startsWith('http') ? trimmed : `https://placeholder${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
        const url = new URL(urlStr);
        const id = url.searchParams.get('id') || url.searchParams.get('invite_id') || url.searchParams.get('iid') || '';
        const type = url.searchParams.get('type') || '';
        const invited_by = url.searchParams.get('invited_by') || '';
        if (id || invited_by) {
            return {id, type, invited_by};
        }
    } catch {
        // Not a valid URL
    }

    if (/^[a-z0-9]+$/i.test(trimmed)) {
        return {id: trimmed, type: '', invited_by: ''};
    }

    return null;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    backButton: {
        padding: 8,
        marginRight: 8,
    },
    title: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    hint: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 16,
    },
    inputContainer: {
        marginBottom: 16,
    },
    errorText: {
        color: theme.errorTextColor,
        ...typography('Body', 75),
        marginTop: 8,
    },
    successText: {
        color: theme.onlineIndicator,
        ...typography('Body', 75),
        marginTop: 8,
    },
    buttonContainer: {
        marginTop: 8,
    },
    icon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.linkColor, 0.12),
        marginBottom: 16,
    },
}));

const InviteLinkScreen = ({componentId, serverUrl: propServerUrl}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const defaultServerUrl = useServerUrl();
    const serverUrl = propServerUrl || defaultServerUrl;
    const styles = getStyleSheet(theme);

    const [inputValue, setInputValue] = useState('');
    const [parsed, setParsed] = useState<{id: string; type: string; invited_by: string} | null>(null);
    const [showError, setShowError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleInputChange = useCallback((text: string) => {
        setInputValue(text);
        setShowError(false);
        const result = parseInviteFromUrl(text);
        setParsed(result);
    }, []);

    const handleConfirm = usePreventDoubleTap(useCallback(async () => {
        Keyboard.dismiss();
        const result = parseInviteFromUrl(inputValue);
        if (!result) {
            setShowError(true);
            return;
        }

        if (!result.id && !result.invited_by) {
            setShowError(true);
            return;
        }

        setIsLoading(true);
        try {
            // Store invite info for post-login join
            EphemeralStore.setPendingInviteInfo({
                inviteId: result.id,
                inviteType: result.type,
                invitedBy: result.invited_by,
            });

            // Go back to login screen
            popTopScreen(componentId);
        } catch (e) {
            logError('InviteLink handleConfirm error', getFullErrorMessage(e));
            Alert.alert(
                intl.formatMessage({id: 'invite_link.error_title', defaultMessage: 'Error'}),
                getFullErrorMessage(e),
            );
        } finally {
            setIsLoading(false);
        }
    }, [componentId, inputValue, intl]));

    const handleBack = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    const hasInput = inputValue.trim().length > 0;
    const isValid = parsed !== null && (parsed.id !== '' || parsed.invited_by !== '');

    return (
        <SafeAreaView
            style={styles.flex}
            testID='invite_link.screen'
        >
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleBack}
                        testID='invite_link.back'
                    >
                        <CompassIcon
                            name='arrow-left'
                            size={24}
                            color={theme.centerChannelColor}
                        />
                    </TouchableOpacity>
                    <Text
                        style={styles.title}
                        numberOfLines={1}
                    >
                        {intl.formatMessage({id: 'invite_link.title', defaultMessage: 'Join via Invite Link'})}
                    </Text>
                </View>

                <View style={styles.icon}>
                    <CompassIcon
                        name='link-variant'
                        size={24}
                        color={theme.linkColor}
                    />
                </View>

                <Text style={styles.hint}>
                    {intl.formatMessage({id: 'invite_link.hint', defaultMessage: 'Paste the invite link you received from the inviter below'})}
                </Text>

                <View style={styles.inputContainer}>
                    <FloatingTextInput
                        rawInput={true}
                        blurOnSubmit={false}
                        autoComplete='off'
                        disableFullscreenUI={true}
                        enablesReturnKeyAutomatically={true}
                        label={intl.formatMessage({id: 'invite_link.input_label', defaultMessage: 'Invite Link'})}
                        onChangeText={handleInputChange}
                        returnKeyType='done'
                        testID='invite_link.input'
                        theme={theme}
                        value={inputValue}
                        autoCapitalize='none'
                        autoCorrect={false}
                    />
                </View>

                {showError && (
                    <Text style={styles.errorText}>
                        {intl.formatMessage({id: 'invite_link.parse_error', defaultMessage: 'Unable to recognize invite link, please check and try again'})}
                    </Text>
                )}

                {isValid && !showError && (
                    <Text style={styles.successText}>
                        {intl.formatMessage({id: 'invite_link.parse_success', defaultMessage: '✅ Invite recognized, tap confirm to continue'})}
                    </Text>
                )}

                <View style={styles.buttonContainer}>
                    <Button
                        disabled={!hasInput || isLoading}
                        onPress={handleConfirm}
                        size='lg'
                        testID='invite_link.confirm.button'
                        text={intl.formatMessage({id: 'invite_link.confirm', defaultMessage: 'Confirm'})}
                        showLoader={isLoading}
                        theme={theme}
                    />
                </View>
            </View>
        </SafeAreaView>
    );
};

export default InviteLinkScreen;
