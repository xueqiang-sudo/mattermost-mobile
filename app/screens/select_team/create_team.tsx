// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
/* eslint-disable max-lines */

import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, Text, TextInput, TouchableOpacity, View} from 'react-native';
import Animated, {FadeIn, useAnimatedStyle} from 'react-native-reanimated';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {createTeamByName} from '@actions/remote/team';
import Button from '@components/button';
import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissModal} from '@screens/navigation';
import {logError} from '@utils/log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {cleanUpUrlable} from '@utils/url';

import type ClientError from '@client/rest/error';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    customHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 5,
        paddingBottom: 5,
        paddingHorizontal: 15,
        backgroundColor: theme.sidebarBg,
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        color: theme.sidebarHeaderTextColor,
        ...typography('Heading', 600),
        flex: 1,
        textAlign: 'center',
        marginLeft: 30,
    },
    scrollContent: {
        flexGrow: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 32,
        paddingBottom: 24,
    },
    progressContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    progressDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    progressDotActive: {
        width: 24,
        backgroundColor: theme.buttonBg,
    },
    progressText: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginLeft: 8,
    },
    stepTipContainer: {
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 10,
        paddingHorizontal: 24,
    },
    stepTipText: {
        color: changeOpacity(theme.buttonBg, 0.68),
        ...typography('Heading', 800, 'SemiBold'),
        fontSize: 22,
        textAlign: 'center',
        lineHeight: 28,
    },
    title: {
        color: theme.centerChannelColor,
        ...typography('Heading', 1000),
        marginBottom: 8,
    },
    creatorCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 32,
    },
    creatorIcon: {
        marginRight: 8,
    },
    creatorText: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 100, 'SemiBold'),
    },
    formContainer: {
        marginBottom: 24,
    },
    inputContainer: {
        marginBottom: 5,
    },
    inputLabel: {
        color: '#986c32',
        ...typography('Heading', 700, 'SemiBold'),
        marginBottom: 5,
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    input: {
        backgroundColor: theme.centerChannelBg,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderWidth: 1.5,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    inputFocused: {
        borderColor: theme.buttonBg,
        borderWidth: 2,
    },
    inputError: {
        borderColor: theme.errorTextColor,
        borderWidth: 1.5,
    },
    urlInputContainer: {
        flexDirection: 'row',
        backgroundColor: theme.centerChannelBg,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderWidth: 1.5,
        borderRadius: 12,
        overflow: 'hidden',
    },
    urlInputContainerFocused: {
        borderColor: theme.buttonBg,
        borderWidth: 2,
    },
    urlInputContainerError: {
        borderColor: theme.errorTextColor,
        borderWidth: 1.5,
    },
    urlPrefix: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        paddingHorizontal: 12,
        paddingVertical: 14,
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: changeOpacity(theme.centerChannelColor, 0.08),
        maxWidth: '60%',
    },
    urlPrefixText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200),
        fontSize: 14,
    },
    urlInput: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: theme.centerChannelColor,
        ...typography('Body', 200),
    },
    hintContainer: {
        marginTop: 24,
        gap: 12,
    },
    hintItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    hintIcon: {
        marginRight: 8,
        marginTop: 2,
    },
    hintText: {
        flex: 1,
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75),
        lineHeight: 20,
    },
    feedbackContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        paddingHorizontal: 4,
    },
    feedbackIcon: {
        marginRight: 6,
    },
    feedbackText: {
        flex: 1,
        ...typography('Body', 75),
    },
    feedbackSuccess: {
        color: theme.onlineIndicator,
    },
    feedbackError: {
        color: theme.errorTextColor,
    },
    urlPreview: {
        marginTop: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.buttonBg, 0.12),
    },
    urlPreviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    urlPreviewText: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75),
    },
    urlPreviewUrl: {
        color: theme.linkColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    copyIconButton: {
        padding: 4,
        marginLeft: 8,
    },
    copySuccessMessage: {
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: theme.onlineIndicator,
        borderRadius: 6,
        flexDirection: 'row',
        alignItems: 'center',
    },
    copySuccessText: {
        color: '#FFFFFF',
        ...typography('Body', 75, 'SemiBold'),
        marginLeft: 6,
    },
    backStepButton: {
        marginTop: 12,
        alignItems: 'center',
        paddingVertical: 12,
    },
    backStepButtonText: {
        color: theme.linkColor,
        ...typography('Body', 200, 'SemiBold'),
    },
}));

const safeAreaEdges = ['left' as const, 'right' as const];
const safeAreaStyle = {flex: 1};

/**
 * CreateTeam Component
 *
 * 用于创建企业的界面，用户可以输入企业名称并提交创建请求
 */
interface CreateTeamProps {
    serverUrl: string;
    nickname: string;
}

const CreateTeam: React.FC<CreateTeamProps> = ({serverUrl, nickname}: CreateTeamProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const intl = useIntl();
    const insets = useSafeAreaInsets();

    // State
    const [step, setStep] = useState<1 | 2>(1);
    const [enterpriseName, setEnterpriseName] = useState('');
    const [enterpriseUrl, setEnterpriseUrl] = useState('');
    const [nameError, setNameError] = useState('');
    const [urlError, setUrlError] = useState('');
    const [loading, setLoading] = useState(false);
    const [nameFocused, setNameFocused] = useState(false);
    const [urlFocused, setUrlFocused] = useState(false);
    const [showCopySuccess, setShowCopySuccess] = useState(false);

    const top = useAnimatedStyle(() => {
        return {height: insets.top, backgroundColor: theme.sidebarBg};
    });

    // Extract domain from serverUrl
    const serverDomain = useMemo(() => {
        try {
            const url = new URL(serverUrl);
            return url.origin;
        } catch {
            return serverUrl;
        }
    }, [serverUrl]);

    // Validate enterprise name
    const validateName = useCallback((value: string): string => {
        if (!value || value.trim().length === 0) {
            return intl.formatMessage({
                id: 'create_team.error_name_required',
                defaultMessage: 'Enterprise name is required',
            });
        }
        if (value.trim().length < 2) {
            return intl.formatMessage({
                id: 'create_team.error_name_too_short',
                defaultMessage: 'Enterprise name must be at least 2 characters',
            });
        }
        if (value.trim().length > 64) {
            return intl.formatMessage({
                id: 'create_team.error_name_too_long',
                defaultMessage: 'Enterprise name cannot exceed 64 characters',
            });
        }
        return '';
    }, [intl]);

    // Validate enterprise URL
    const validateUrl = useCallback((value: string): string => {
        if (!value || value.trim().length === 0) {
            return intl.formatMessage({
                id: 'create_team.error_url_required',
                defaultMessage: 'Enterprise URL is required',
            });
        }
        if (value.length < 2) {
            return intl.formatMessage({
                id: 'create_team.error_url_too_short',
                defaultMessage: 'URL must be at least 2 characters',
            });
        }
        if (value.length > 64) {
            return intl.formatMessage({
                id: 'create_team.error_url_too_long',
                defaultMessage: 'URL cannot exceed 64 characters',
            });
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
            return intl.formatMessage({
                id: 'create_team.error_url_invalid',
                defaultMessage: 'URL can only contain lowercase letters, numbers, and hyphens',
            });
        }
        if (!/^[a-z]/.test(value)) {
            return intl.formatMessage({
                id: 'create_team.error_url_must_start_letter',
                defaultMessage: 'URL must start with a letter',
            });
        }
        if (/-$/.test(value)) {
            return intl.formatMessage({
                id: 'create_team.error_url_cannot_end_dash',
                defaultMessage: 'URL cannot end with a hyphen',
            });
        }
        return '';
    }, [intl]);

    // Handle enterprise name change
    const handleNameChange = useCallback((value: string) => {
        setEnterpriseName(value);
        if (nameError) {
            setNameError('');
        }
    }, [nameError]);

    // Handle URL change with auto-formatting
    const handleUrlChange = useCallback((value: string) => {
        const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        setEnterpriseUrl(cleaned);
        setUrlError(validateUrl(cleaned));
    }, [validateUrl]);

    // Handle next step
    const handleNext = usePreventDoubleTap(() => {
        const error = validateName(enterpriseName);
        if (error) {
            setNameError(error);
            return;
        }

        // Auto-generate URL suggestion from name
        const suggestion = cleanUpUrlable(enterpriseName);

        setEnterpriseUrl(suggestion && !validateUrl(suggestion) ? suggestion : '');
        setStep(2);
    });

    // Handle close modal
    const handleClose = useCallback(() => {
        dismissModal({componentId: Screens.CREATE_TEAM});
    }, []);

    // Handle back to previous step
    const handleBackStep = useCallback(() => {
        setStep(1);
    }, []);

    // Handle create
    const handleCreate = usePreventDoubleTap(async () => {
        const error = validateUrl(enterpriseUrl);
        if (error) {
            setUrlError(error);
            return;
        }

        setLoading(true);
        try {
            // 创建企业
            const {error: createTeamError} = await createTeamByName(serverUrl, enterpriseUrl, enterpriseName);
            if (createTeamError) {
                throw createTeamError;
            }
            dismissModal({componentId: Screens.CREATE_TEAM});
        } catch (err) {
            if ((err as ClientError).server_error_id === 'store.sql_team.save_team.existing.app_error') {
                // 已经存在企业，需要提示
                setUrlError(intl.formatMessage({
                    id: 'create_team.error_url_exists',
                    defaultMessage: 'An enterprise with this URL already exists',
                }));
            } else {
                logError('create enterprise failed with error', err);

                // 创建企业失败
                setUrlError(intl.formatMessage({
                    id: 'create_team.error_create_team_failed',
                    defaultMessage: 'Failed to create enterprise',
                }));
            }
        } finally {
            setLoading(false);
        }
    });

    // Full URL preview
    const fullUrl = useMemo(() => {
        if (!enterpriseUrl) {
            return '';
        }
        return `${serverDomain}/${enterpriseUrl}`;
    }, [serverDomain, enterpriseUrl]);

    // Check if URL is valid
    const isUrlValid = useMemo(() => {
        return enterpriseUrl.length > 0 && !validateUrl(enterpriseUrl);
    }, [enterpriseUrl, validateUrl]);

    // Handle copy URL
    const handleCopyUrl = useCallback(() => {
        if (fullUrl) {
            Clipboard.setString(fullUrl);
            setShowCopySuccess(true);
            setTimeout(() => {
                setShowCopySuccess(false);
            }, 3000);
        }
    }, [fullUrl]);

    return (
        <SafeAreaView
            mode='margin'
            edges={safeAreaEdges}
            style={safeAreaStyle}
            nativeID='select_team_create_team'
        >
            <Animated.View style={top}/>
            <View style={styles.container}>
                {/* Custom Header */}
                <View style={styles.customHeader}>
                    <FormattedText
                        style={styles.headerTitle}
                        id='create_team.title'
                        defaultMessage='Create Enterprise'
                    />
                    <TouchableOpacity
                        onPress={handleClose}
                        style={styles.backButton}
                        testID='create_team.close_button'
                    >
                        <CompassIcon
                            name='close'
                            size={24}
                            color={theme.sidebarHeaderTextColor}
                        />
                    </TouchableOpacity>
                </View>

                {/* Content Area */}
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps='handled'
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.content}>
                        {/* Progress Indicator */}
                        <View style={styles.progressContainer}>
                            <View style={[styles.progressDot, step === 1 && styles.progressDotActive]}/>
                            <View style={[styles.progressDot, step === 2 && styles.progressDotActive]}/>
                            <FormattedText
                                style={styles.progressText}
                                id='create_team.step_progress'
                                defaultMessage='Step {current} of {total}'
                                values={{current: step, total: 2}}
                            />
                        </View>

                        {/* Step 1: Enterprise Name */}
                        {step === 1 && (
                            <Animated.View
                                entering={FadeIn.duration(300)}
                            >
                                <View style={styles.stepTipContainer}>
                                    <FormattedText
                                        style={styles.stepTipText}
                                        id='create_team.step1_tip'
                                        defaultMessage='Please name your enterprise'
                                    />
                                </View>

                                {/* Creator Info Card */}
                                <View style={styles.creatorCard}>
                                    <CompassIcon
                                        name='account-outline'
                                        size={20}
                                        color={changeOpacity(theme.centerChannelColor, 0.72)}
                                        style={styles.creatorIcon}
                                    />
                                    <Text style={styles.creatorText}>
                                        <FormattedText
                                            id='create_team.created_by'
                                            defaultMessage='Created by @{nickname}'
                                            values={{nickname}}
                                        />
                                    </Text>
                                </View>

                                {/* Enterprise Name Input */}
                                <View style={styles.formContainer}>
                                    <View style={styles.inputContainer}>
                                        <FormattedText
                                            style={styles.inputLabel}
                                            id='create_team.enterprise_name'
                                            defaultMessage='Enterprise Name'
                                        />
                                        <TextInput
                                            style={[
                                                styles.input,
                                                nameFocused && styles.inputFocused,
                                                nameError && styles.inputError,
                                            ]}
                                            value={enterpriseName}
                                            onChangeText={handleNameChange}
                                            onFocus={() => setNameFocused(true)}
                                            onBlur={() => setNameFocused(false)}
                                            placeholder={intl.formatMessage({
                                                id: 'create_team.enterprise_name_placeholder',
                                                defaultMessage: 'Enter your enterprise name',
                                            })}
                                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                                            autoCapitalize='words'
                                            returnKeyType='next'
                                            testID='create_team.enterprise_name.input'
                                        />
                                        {nameError && (
                                            <View style={styles.feedbackContainer}>
                                                <CompassIcon
                                                    name='alert-circle-outline'
                                                    size={16}
                                                    color={theme.errorTextColor}
                                                    style={styles.feedbackIcon}
                                                />
                                                <Text style={[styles.feedbackText, styles.feedbackError]}>
                                                    {nameError}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </Animated.View>
                        )}

                        {/* Step 2: Enterprise URL */}
                        {step === 2 && (
                            <Animated.View
                                entering={FadeIn.duration(300)}
                            >
                                <View style={styles.stepTipContainer}>
                                    <FormattedText
                                        style={styles.stepTipText}
                                        id='create_team.step2_tip'
                                        defaultMessage='Please set the URL for your enterprise'
                                    />
                                </View>

                                {/* URL Input */}
                                <View style={styles.formContainer}>
                                    <View style={styles.inputContainer}>
                                        <FormattedText
                                            style={styles.inputLabel}
                                            id='create_team.url_prefix_label'
                                            defaultMessage='Enterprise URL'
                                        />
                                        <View
                                            style={[
                                                styles.urlInputContainer,
                                                urlFocused && styles.urlInputContainerFocused,
                                                urlError && styles.urlInputContainerError,
                                            ]}
                                        >
                                            <View style={styles.urlPrefix}>
                                                <Text style={styles.urlPrefixText}>
                                                    {`${serverDomain}/`}
                                                </Text>
                                            </View>
                                            <TextInput
                                                style={styles.urlInput}
                                                value={enterpriseUrl}
                                                onChangeText={handleUrlChange}
                                                onFocus={() => setUrlFocused(true)}
                                                onBlur={() => setUrlFocused(false)}
                                                placeholder={intl.formatMessage({
                                                    id: 'create_team.url_placeholder',
                                                    defaultMessage: 'Enter your enterprise url',
                                                })}
                                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                                                autoCapitalize='none'
                                                autoCorrect={false}
                                                returnKeyType='done'
                                                testID='create_team.enterprise_url.input'
                                            />
                                        </View>

                                        {/* Validation Feedback */}
                                        {enterpriseUrl.length > 0 && isUrlValid && (
                                            <View style={styles.feedbackContainer}>
                                                <CompassIcon
                                                    name='check-circle'
                                                    size={16}
                                                    color={theme.onlineIndicator}
                                                    style={styles.feedbackIcon}
                                                />
                                                <FormattedText
                                                    style={[styles.feedbackText, styles.feedbackSuccess]}
                                                    id='create_team.url_available'
                                                    defaultMessage='This URL is available'
                                                />
                                            </View>
                                        )}
                                        {enterpriseUrl.length > 0 && urlError && (
                                            <View style={styles.feedbackContainer}>
                                                <CompassIcon
                                                    name='alert-circle-outline'
                                                    size={16}
                                                    color={theme.errorTextColor}
                                                    style={styles.feedbackIcon}
                                                />
                                                <Text style={[styles.feedbackText, styles.feedbackError]}>
                                                    {urlError}
                                                </Text>
                                            </View>
                                        )}

                                        {/* URL Preview */}
                                        {fullUrl && (
                                            <View style={styles.urlPreview}>
                                                <View style={styles.urlPreviewHeader}>
                                                    <FormattedText
                                                        style={styles.urlPreviewText}
                                                        id='create_team.url_preview'
                                                        defaultMessage='Full URL: {url}'
                                                        values={{url: ''}}
                                                    />
                                                    <TouchableOpacity
                                                        style={styles.copyIconButton}
                                                        onPress={handleCopyUrl}
                                                        activeOpacity={0.6}
                                                        testID='create_team.copy_url_button'
                                                    >
                                                        <CompassIcon
                                                            name='content-copy'
                                                            size={18}
                                                            color={theme.linkColor}
                                                        />
                                                    </TouchableOpacity>
                                                </View>
                                                <Text style={styles.urlPreviewUrl}>{fullUrl}</Text>
                                                {showCopySuccess && (
                                                    <View style={styles.copySuccessMessage}>
                                                        <CompassIcon
                                                            name='check-circle'
                                                            size={14}
                                                            color='#FFFFFF'
                                                        />
                                                        <FormattedText
                                                            style={styles.copySuccessText}
                                                            id='create_team.url_copied'
                                                            defaultMessage='URL Copied'
                                                        />
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>

                                    {/* Hints */}
                                    <View style={styles.hintContainer}>
                                        <View style={styles.hintItem}>
                                            <CompassIcon
                                                name='information-outline'
                                                size={16}
                                                color={changeOpacity(theme.centerChannelColor, 0.56)}
                                                style={styles.hintIcon}
                                            />
                                            <Text style={styles.hintText}>
                                                <FormattedText
                                                    id='create_team.url_hint_1'
                                                    defaultMessage='Keep it short and memorable'
                                                />
                                            </Text>
                                        </View>
                                        <View style={styles.hintItem}>
                                            <CompassIcon
                                                name='information-outline'
                                                size={16}
                                                color={changeOpacity(theme.centerChannelColor, 0.56)}
                                                style={styles.hintIcon}
                                            />
                                            <Text style={styles.hintText}>
                                                <FormattedText
                                                    id='create_team.url_hint_2'
                                                    defaultMessage='Use lowercase letters, numbers, and hyphens'
                                                />
                                            </Text>
                                        </View>
                                        <View style={styles.hintItem}>
                                            <CompassIcon
                                                name='information-outline'
                                                size={16}
                                                color={changeOpacity(theme.centerChannelColor, 0.56)}
                                                style={styles.hintIcon}
                                            />
                                            <Text style={styles.hintText}>
                                                <FormattedText
                                                    id='create_team.url_hint_3'
                                                    defaultMessage='Must start with a letter and cannot end with a hyphen'
                                                />
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </Animated.View>
                        )}

                        {/* Action Buttons */}
                        <View>
                            {step === 1 ? (
                                <Button
                                    onPress={handleNext}
                                    text={intl.formatMessage({
                                        id: 'create_team.next',
                                        defaultMessage: 'Next',
                                    })}
                                    theme={theme}
                                    size='lg'
                                    disabled={!enterpriseName.trim()}
                                    testID='create_team.next_button'
                                />
                            ) : (
                                <>
                                    <Button
                                        onPress={handleCreate}
                                        text={intl.formatMessage({
                                            id: 'create_team.create',
                                            defaultMessage: 'Create',
                                        })}
                                        theme={theme}
                                        size='lg'
                                        showLoader={loading}
                                        disabled={!isUrlValid || loading}
                                        testID='create_team.create_button'
                                    />
                                    <TouchableOpacity
                                        style={styles.backStepButton}
                                        onPress={handleBackStep}
                                        disabled={loading}
                                        testID='create_team.back_step_button'
                                    >
                                        <Text style={styles.backStepButtonText}>
                                            <FormattedText
                                                id='create_team.back'
                                                defaultMessage='Back'
                                            />
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>
                </ScrollView>
            </View>
        </SafeAreaView>
    );
};

export default CreateTeam;
