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
import {debugLog} from '@store/debug_log';
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

    debugLog('[parseInviteFromUrl] Input', JSON.stringify({input, trimmed}));

    if (!trimmed) {
        debugLog('[parseInviteFromUrl] Empty input, returning null');
        return null;
    }

    // Try using URL API first
    try {
        const urlStr = trimmed.startsWith('http') ? trimmed : `https://placeholder${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
        debugLog('[parseInviteFromUrl] Parsing URL', JSON.stringify({urlStr}));

        const url = new URL(urlStr);
        const id = url.searchParams.get('id') || url.searchParams.get('invite_id') || url.searchParams.get('iid') || '';
        const type = url.searchParams.get('type') || '';
        const invited_by = url.searchParams.get('invited_by') || '';

        debugLog('[parseInviteFromUrl] Extracted params', JSON.stringify({id, type, invited_by}));

        if (id || invited_by) {
            debugLog('[parseInviteFromUrl] Returning valid result', JSON.stringify({id, type, invited_by}));
            return {id, type, invited_by};
        }

        debugLog('[parseInviteFromUrl] No id or invited_by found via URL API');
    } catch (err) {
        debugLog('[parseInviteFromUrl] URL parsing failed', JSON.stringify({error: String(err)}));
    }

    // Fallback: Manual parsing for iOS/Hermes compatibility
    try {
        debugLog('[parseInviteFromUrl] Trying fallback manual parsing');

        // Extract query string manually
        const questionMarkIndex = trimmed.indexOf('?');
        if (questionMarkIndex !== -1) {
            const queryString = trimmed.substring(questionMarkIndex + 1);
            debugLog('[parseInviteFromUrl] Query string', JSON.stringify({queryString}));

            // Parse query parameters manually
            const params: Record<string, string> = {};
            const pairs = queryString.split('&');
            for (const pair of pairs) {
                const eqIndex = pair.indexOf('=');
                if (eqIndex !== -1) {
                    const key = decodeURIComponent(pair.substring(0, eqIndex));
                    const value = decodeURIComponent(pair.substring(eqIndex + 1));
                    params[key] = value;
                }
            }

            const id = params.id || params.invite_id || params.iid || '';
            const type = params.type || '';
            const invited_by = params.invited_by || '';

            debugLog('[parseInviteFromUrl] Manual parsing result', JSON.stringify({id, type, invited_by}));

            if (id || invited_by) {
                debugLog('[parseInviteFromUrl] Returning manual parsing result');
                return {id, type, invited_by};
            }
        }

        debugLog('[parseInviteFromUrl] No query parameters found in fallback');
    } catch (err) {
        debugLog('[parseInviteFromUrl] Manual parsing failed', JSON.stringify({error: String(err)}));
    }

    // Last resort: treat as raw ID
    if (/^[a-z0-9]+$/i.test(trimmed)) {
        debugLog('[parseInviteFromUrl] Treating as raw ID', JSON.stringify({id: trimmed}));
        return {id: trimmed, type: '', invited_by: ''};
    }

    debugLog('[parseInviteFromUrl] Returning null');
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
        // Clean the input: remove invisible characters and normalize whitespace and full-width chars
        const cleaned = text
            .replace(/[​‌‍﻿]/g, '')  // Remove zero-width characters
            .replace(/ /g, ' ')                 // Replace non-breaking spaces
            .replace(/\s+/g, ' ')                    // Normalize whitespace
            .replace(/：/g, ':')
            .replace(/／/g, '/')
            .replace(/？/g, '?')
            .replace(/＝/g, '=')
            .replace(/＆/g, '&')
            .replace(/＃/g, '#')
            .trim();

        debugLog('[InviteLink] Input changed (before cleaning)', JSON.stringify({
            originalText: text,
            originalLength: text.length,
            cleanedText: cleaned,
            cleanedLength: cleaned.length,
            hasChanged: text !== cleaned,
        }));

        setInputValue(cleaned);
        setShowError(false);
        const result = parseInviteFromUrl(cleaned);
        debugLog('[InviteLink] Input changed (after cleaning)', JSON.stringify({
            text: cleaned,
            textLength: cleaned.length,
            result,
            isValid: result !== null && (result.id !== '' || result.invited_by !== ''),
        }));
        setParsed(result);
    }, []);

    const handleConfirm = usePreventDoubleTap(useCallback(async () => {
        Keyboard.dismiss();

        debugLog('[InviteLink] Confirm clicked', JSON.stringify({
            inputValue,
            inputValueLength: inputValue?.length,
            parsed,
        }));

        const result = parseInviteFromUrl(inputValue);

        debugLog('[InviteLink] Parsing invite URL', JSON.stringify({
            inputValue,
            result,
        }));

        if (!result) {
            debugLog('[InviteLink] Parse result is null');
            setShowError(true);
            return;
        }

        if (!result.id && !result.invited_by) {
            debugLog('[InviteLink] Both id and invited_by are empty', JSON.stringify(result));
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

            debugLog('[InviteLink] Stored invite info', JSON.stringify({
                inviteId: result.id,
                inviteType: result.type,
                invitedBy: result.invited_by,
            }));

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

    // Test function to quickly set a valid invite link
    const handleTestInvite = useCallback(() => {
        const testUrl = 'https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw';
        setInputValue(testUrl);
        const result = parseInviteFromUrl(testUrl);
        setParsed(result);
        setShowError(false);
        debugLog('[InviteLink] Test invite set', JSON.stringify({testUrl, result}));
    }, []);

    // Debug function to show detailed character analysis
    const handleShowCharAnalysis = useCallback(() => {
        if (!inputValue) {
            Alert.alert('No input', 'Please paste an invite link first');
            return;
        }
        
        const charCodes = inputValue.split('').map((c, i) => {
            const code = c.charCodeAt(0);
            return `${i}: '${c}' (0x${code.toString(16).padStart(4, '0')}, ${code})`;
        }).join('\n');
        
        Alert.alert(
            'Character Analysis',
            `Input length: ${inputValue.length}\n\n` + charCodes,
            [{text: 'OK'}]
        );
    }, [inputValue]);

    // Debug function to test parsing step by step
    const handleTestParsing = useCallback(() => {
        if (!inputValue) {
            Alert.alert('No input', 'Please paste an invite link first');
            return;
        }

        const steps: string[] = [];
        const trimmed = inputValue.trim();
        steps.push(`1. Input length: ${inputValue.length}`);
        steps.push(`2. Trimmed length: ${trimmed.length}`);
        steps.push(`3. Starts with http: ${trimmed.startsWith('http')}`);
        steps.push(`4. Contains ?: ${trimmed.includes('?')}`);

        // Try URL API
        try {
            const url = new URL(trimmed);
            steps.push(`5. URL API: ✅ Success`);
            steps.push(`6. URL href: ${url.href}`);
            steps.push(`7. URL search: ${url.search}`);

            const invited_by = url.searchParams.get('invited_by');
            steps.push(`8. invited_by: ${invited_by || '(null)'}`);
        } catch (err) {
            steps.push(`5. URL API: ❌ Failed`);
            steps.push(`   Error: ${String(err)}`);
        }

        // Try manual parsing
        const qIndex = trimmed.indexOf('?');
        steps.push(`9. Manual parsing:`);
        steps.push(`   ? at index: ${qIndex}`);
        if (qIndex !== -1) {
            const query = trimmed.substring(qIndex + 1);
            steps.push(`   Query: ${query}`);
            const ibIndex = query.indexOf('invited_by=');
            steps.push(`   invited_by= at: ${ibIndex}`);
            if (ibIndex !== -1) {
                const value = query.substring(ibIndex + 11).split('&')[0];
                steps.push(`   Value: ${value}`);
            }
        }

        Alert.alert(
            '🔍 Parsing Test',
            steps.join('\n'),
            [{text: 'OK'}]
        );
    }, [inputValue]);

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
                    <View>
                        <Text style={styles.errorText}>
                            {intl.formatMessage({id: 'invite_link.parse_error', defaultMessage: 'Unable to recognize invite link, please check and try again'})}
                        </Text>
                        <Text style={{...styles.errorText, fontSize: 11, marginTop: 4, opacity: 0.8}}>
                            {'Debug: length=' + inputValue.length + ', hasHttp=' + inputValue.includes('http') + ', parsed=' + (parsed ? 'yes' : 'null')}
                        </Text>
                        <Text style={{...styles.errorText, fontSize: 11, marginTop: 4, opacity: 0.8}}>
                            {'请尝试点击下方的 "🧪 Test Invite Link" 按钮'}
                        </Text>
                    </View>
                )}

                {isValid && !showError && (
                    <Text style={styles.successText}>
                        {intl.formatMessage({id: 'invite_link.parse_success', defaultMessage: '✅ Invite recognized, tap confirm to continue'})}
                    </Text>
                )}

                {/* Debug info visible on screen */}
                {hasInput && (
                    <View style={{marginTop: 12, padding: 8, backgroundColor: changeOpacity(theme.centerChannelColor, 0.05), borderRadius: 4}}>
                        <Text style={{fontSize: 11, color: changeOpacity(theme.centerChannelColor, 0.6), fontFamily: 'monospace'}}>
                            {'📊 Debug Info:\n'}
                            {'Input length: ' + inputValue.length + '\n'}
                            {'Parsed: ' + (parsed ? 'Yes ✅' : 'No ❌') + '\n'}
                            {parsed ? ('  id: ' + (parsed.id || '(empty)') + '\n') : ''}
                            {parsed ? ('  invited_by: ' + (parsed.invited_by || '(empty)') + '\n') : ''}
                            {parsed ? ('  type: ' + (parsed.type || '(empty)') + '\n') : ''}
                            {'Valid: ' + (isValid ? 'Yes ✅' : 'No ❌') + '\n'}
                            {'---\n'}
                            {'Contains "?": ' + inputValue.includes('?') + '\n'}
                            {'Contains "invited_by": ' + inputValue.includes('invited_by') + '\n'}
                            {'Contains "=": ' + inputValue.includes('=') + '\n'}
                            {'First 20 chars: ' + inputValue.substring(0, 20).split('').map(c => c.charCodeAt(0).toString(16)).join(' ')}
                        </Text>
                    </View>
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

                {/* Test button for debugging */}
                <View style={{marginTop: 16}}>
                    <Button
                        onPress={handleTestInvite}
                        size='md'
                        testID='invite_link.test.button'
                        text={'🧪 Test Invite Link'}
                        theme={theme}
                    />
                </View>

                {/* Character analysis button */}
                <View style={{marginTop: 8}}>
                    <Button
                        onPress={handleShowCharAnalysis}
                        size='md'
                        testID='invite_link.char_analysis.button'
                        text={'🔍 Show Character Analysis'}
                        theme={theme}
                    />
                </View>

                {/* Parsing test button */}
                <View style={{marginTop: 8}}>
                    <Button
                        onPress={handleTestParsing}
                        size='md'
                        testID='invite_link.parsing_test.button'
                        text={'🧪 Test Parsing Steps'}
                        theme={theme}
                    />
                </View>
            </View>
        </SafeAreaView>
    );
};

export default InviteLinkScreen;
