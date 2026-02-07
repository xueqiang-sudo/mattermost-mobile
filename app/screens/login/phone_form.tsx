// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Keyboard, Text, TextInput, TouchableOpacity, View} from 'react-native';

import {doPing} from '@actions/remote/general';
import {sendSmsCode, verifySmsCode} from '@actions/remote/plugin_gateway';
import {login, userPwdLoginAPI} from '@actions/remote/session';
import {fetchConfigAndLicense} from '@actions/remote/systems';
import Button from '@components/button';
import {CustomInputModal, useCustomInputModal} from '@components/custom_input_modal';
import FloatingTextInput from '@components/floating_input/floating_text_input_label';
import {useAvoidKeyboard} from '@hooks/device';
import {usePreventDoubleTap} from '@hooks/utils';
import {getAutoClient} from '@managers/network_manager';
import {resetToHome} from '@screens/navigation';
import {getFullErrorMessage} from '@utils/errors';
import {formatPhone, isPhoneNumber} from '@utils/form-rule';
import {logError, logInfo} from '@utils/log';
import {canReceiveNotifications} from '@utils/push_proxy';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import PhoneInput from './PhoneInput';

import type ClientError from '@client/rest/error';
import type {LaunchProps} from '@typings/launch';
import type {KeyboardAwareScrollView} from 'react-native-keyboard-aware-scroll-view';

interface PhoneLoginProps extends LaunchProps {
    keyboardAwareRef: React.RefObject<KeyboardAwareScrollView>;
    theme: Theme;
    serverUrl: string;
}

const hitSlop = {top: 8, right: 8, bottom: 8, left: 8};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        width: '100%',
        maxWidth: 400,
        gap: 24,
    },
    loginButtonContainer: {
        marginTop: 20,
        width: '100%',
    },
    endAdornment: {
        top: 2,
    },
    phoneInputContainer: {
        position: 'relative',
        width: '100%',
    },
    verifySmsCodeContainer: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        width: '100%',
    },
    verifySmsCodeInput: {
        flex: 1,
        minHeight: 56,
        maxHeight: 56,
    },
    getCodeButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.buttonBg,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 120,
    },
    getCodeButtonText: {
        color: theme.buttonBg,
        fontSize: 14,
        fontFamily: 'OpenSans-SemiBold',
    },
    getCodeButtonDisabled: {
        borderColor: changeOpacity(theme.buttonBg, 0.5),
    },
    getCodeButtonTextDisabled: {
        color: changeOpacity(theme.buttonBg, 0.5),
    },
    errorText: {
        color: theme.errorTextColor,
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
    },
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.5),
    },
    modalContent: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 24,
        width: '80%',
        maxHeight: '60%',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    countryItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    countryName: {
        fontSize: 16,
        color: theme.centerChannelColor,
    },
    countryCode: {
        fontSize: 16,
        color: changeOpacity(theme.centerChannelColor, 0.6),
    },
}));

const messages = defineMessages({
    signIn: {
        id: 'login.signIn',
        defaultMessage: 'Log In',
    },
    signingIn: {
        id: 'login.signingIn',
        defaultMessage: 'Logging In',
    },
    phoneNumber: {
        id: 'login.phoneNumber',
        defaultMessage: 'Phone Number',
    },
    verificationCode: {
        id: 'login.verificationCode',
        defaultMessage: 'Verification Code',
    },
    getCode: {
        id: 'login.getCode',
        defaultMessage: 'Get Code',
    },
    sendingCode: {
        id: 'login.sendingCode',
        defaultMessage: 'Sending...',
    },
    enterNickname: {
        id: 'login.enterNickname',
        defaultMessage: 'Enter Nickname',
    },
    nicknamePlaceholder: {
        id: 'login.nicknamePlaceholder',
        defaultMessage: 'Please enter your nickname',
    },
    confirm: {
        id: 'common_modal.confirm',
        defaultMessage: 'Confirm',
    },
});

const PhoneLoginForm = ({
    extra,
    keyboardAwareRef,
    launchError,
    launchType,
    theme,
    serverUrl,
}: PhoneLoginProps) => {
    const styles = getStyleSheet(theme);
    const codeRef = useRef<TextInput>(null);
    const intl = useIntl();

    // 状态管理
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isGettingCode, setIsGettingCode] = useState<boolean>(false);
    const [error, setError] = useState<string | undefined>();
    const [phoneNumber, setPhoneNumber] = useState<string>('');
    const [verificationCode, setVerificationCode] = useState<string>('');
    const [countdown, setCountdown] = useState<number>(0);

    useAvoidKeyboard(keyboardAwareRef);

    // 使用自定义输入对话框 hook
    const {
        visible: showNicknameModal,
        options,
        showModal,
        handleConfirm,
        handleCancel,
    } = useCustomInputModal();

    // 显示昵称输入对话框并返回 Promise
    const showNicknameInput = useCallback((): Promise<string | null> => {
        return showModal({
            title: intl.formatMessage(messages.enterNickname),
            placeholder: intl.formatMessage(messages.nicknamePlaceholder),
            confirmContent: intl.formatMessage(messages.confirm),
            showCancelButton: false,
        });
    }, [showModal, intl]);

    const goToHome = useCallback((loginError?: unknown) => {
        const hasError = launchError || Boolean(loginError);
        resetToHome({extra, launchError: hasError, launchType});
    }, [extra, launchError, launchType]);

    // const check = useCallback(async () => {
    //     const result = await doPing(serverUrl, true);
    //     if (result.error) {

    //     }

    //     const data = await fetchConfigAndLicense(server.url, true);
    //     if (data.error) {
    //         alertServerError(intl, data.error);
    //         callback?.();
    //         return;
    //     }
    // }, [serverUrl])

    // 获取验证码
    const getVerificationCode = useCallback(async () => {
        setIsGettingCode(true);
        setError(undefined);

        try {
            // 调用获取验证码 API
            const res = await sendSmsCode(serverUrl, phoneNumber);
            setVerificationCode(res.code || ''); // 这里的 code 正常不会有，这里是为了如果后端模拟发送，则返回结果里面携带模拟的验证码

            // 模拟成功响应
            setCountdown(60); // 60秒倒计时

            // 开始倒计时
            const timer = setInterval(() => {
                // eslint-disable-next-line max-nested-callbacks
                setCountdown((prevCountdown) => {
                    if (prevCountdown <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prevCountdown - 1;
                });
            }, 1000);

        } catch (loginError) {
            if ((loginError as ClientError).server_error_id === 'com.mattermost.sms-gateway' && (loginError as ClientError).message === 'Too many requests') {
                setError(intl.formatMessage({
                    id: 'login.error_too_many_requests',
                    defaultMessage: 'Too many requests, please try again later',
                }));
            } else {
                logError('error on getVerificationCode', getFullErrorMessage(loginError));
                setError(getFullErrorMessage(loginError));
            }
        } finally {
            setIsGettingCode(false);
        }
    }, [intl, phoneNumber, serverUrl]);

    // 手机验证码登录
    const signInWithPhone = useCallback(async () => {
        setIsLoading(true);
        setError(undefined);

        try {
            // 1. 验证验证码
            const verifyData = await verifySmsCode(serverUrl, phoneNumber, verificationCode);
            const token = verifyData.token;
            if (!token) {
                throw new Error('No token received');
            }

            // 2. ping 服务器并且获取配置
            const pingResult = await doPing(serverUrl, true);
            if (pingResult.error) {
                throw pingResult.error;
            }
            canReceiveNotifications(serverUrl, pingResult.canReceiveNotifications as string, intl);
            const cfgLicenseData = await fetchConfigAndLicense(serverUrl, true);
            if (cfgLicenseData.error) {
                throw cfgLicenseData.error;
            }

            // 3. 调用创建用户接口尝试创建新用户
            try {
                const apiClient = await getAutoClient(serverUrl);
                await apiClient.autoRegisterPhoneUser(formatPhone(phoneNumber), token);

                // 成功创建用户
                logInfo('user created successfully, user: ', phoneNumber);
            } catch (createUserError) {
                if (!((createUserError as ClientError).server_error_id === 'app.user.save.username_exists.app_error')) {
                    throw createUserError;
                }

                // 已经创建用户，忽略错误
                logInfo('user already exists, ignore error, user: ', phoneNumber);
            }

            // 4. 调用登录接口
            // 4.1 调用 userPwdLoginAPI 进行登陆，获取 nickname，如果未获取到，需要让用户输入显示的昵称
            const loginedUser = await userPwdLoginAPI(serverUrl, {ldapOnly: false, loginId: formatPhone(phoneNumber), password: token});
            let userNickname = loginedUser?.nickname;

            // 4.2 如果未获取到昵称，显示昵称输入对话框
            if (!userNickname) {
                // 显示昵称输入对话框并等待用户输入
                const inputNickname = await showNicknameInput();
                if (!inputNickname) {
                    throw new Error('Nickname is required');
                }

                // 如果用户输入了昵称，更新用户信息
                const apiClient = await getAutoClient(serverUrl);
                const updateResult = await apiClient.patchMe({nickname: inputNickname});
                userNickname = updateResult.nickname || inputNickname;
            }

            // 4.3 调用 login 接口进行登录，注意需要传递 loginedUser 参数
            const loginResult = await login(serverUrl, {serverDisplayName: userNickname, loginId: formatPhone(phoneNumber), password: token, config: cfgLicenseData.config!, license: cfgLicenseData.license!, loginedUser});
            if (loginResult.error) {
                throw loginResult.error;
            }

            // 登录成功
            setError(undefined);
            setIsLoading(false);
            goToHome();
        } catch (loginError) {
            logError('error on signInWithPhone', getFullErrorMessage(loginError));
            setError(getFullErrorMessage(loginError));
            setIsLoading(false);
        }
    }, [goToHome, intl, phoneNumber, serverUrl, showNicknameInput, verificationCode]);

    const preSignIn = usePreventDoubleTap(useCallback(() => {
        Keyboard.dismiss();
        signInWithPhone();
    }, [signInWithPhone]));

    const preGetCode = usePreventDoubleTap(useCallback(() => {
        Keyboard.dismiss();
        getVerificationCode();
    }, [getVerificationCode]));

    const onPhoneChange = useCallback((text: string) => {
        setPhoneNumber(text);
        setError(undefined);
    }, []);

    const onCodeChange = useCallback((text: string) => {
        setVerificationCode(text);
        setError(undefined);
    }, []);

    const onCodeInputSubmitting = useCallback(() => {
        preSignIn();
    }, [preSignIn]);

    // 获取验证码按钮文本
    const getCodeButtonText = useCallback(() => {
        if (isGettingCode) {
            return intl.formatMessage(messages.sendingCode);
        }
        if (countdown > 0) {
            return `${countdown}s`;
        }
        return intl.formatMessage(messages.getCode);
    }, [isGettingCode, countdown, intl]);

    // 检查手机号是否有效
    const isPhoneValid = useCallback(() => isPhoneNumber(phoneNumber), [phoneNumber]);

    const buttonDisabled = !phoneNumber || !isPhoneValid() || !verificationCode || isLoading;

    // 昵称输入对话框
    const nicknameModal = (
        <CustomInputModal
            visible={showNicknameModal}
            title={options.title}
            placeholder={options.placeholder}
            confirmContent={options.confirmContent}
            showCancelButton={options.showCancelButton}
            cancelContent={options.cancelContent}
            theme={theme}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
        />
    );

    const proceedButton = (
        <View style={styles.loginButtonContainer}>
            <Button
                disabled={buttonDisabled}
                onPress={preSignIn}
                size='lg'
                testID={buttonDisabled ? 'login_form.signin.button.disabled' : 'login_form.signin.button'}
                text={intl.formatMessage(isLoading ? messages.signingIn : messages.signIn)}
                showLoader={isLoading}
                theme={theme}
            />
        </View>
    );

    return (
        <View style={styles.container}>
            {/* 手机号输入 */}
            <View style={styles.phoneInputContainer}>
                <PhoneInput
                    defaultValue={phoneNumber}
                    onChangeText={onPhoneChange}
                    theme={theme}
                />
            </View>

            {/* 验证码输入和获取验证码按钮 */}
            <View style={styles.verifySmsCodeContainer}>
                <View style={styles.verifySmsCodeInput}>
                    <FloatingTextInput
                        rawInput={true}
                        blurOnSubmit={false}
                        autoComplete='one-time-code'
                        disableFullscreenUI={true}
                        enablesReturnKeyAutomatically={true}
                        error={error ? ' ' : ''}
                        keyboardType='number-pad'
                        label={intl.formatMessage(messages.verificationCode)}
                        onChangeText={onCodeChange}
                        onSubmitEditing={onCodeInputSubmitting}
                        ref={codeRef}
                        returnKeyType='join'
                        hideErrorIcon={true}
                        testID='login_form.verification.code.input'
                        theme={theme}
                        value={verificationCode}
                        editable={countdown > 0}
                    />
                </View>
                <TouchableOpacity
                    style={[
                        styles.getCodeButton,
                        (!phoneNumber || !isPhoneValid() || countdown > 0 || isGettingCode) && styles.getCodeButtonDisabled,
                    ]}
                    onPress={preGetCode}
                    disabled={!phoneNumber || !isPhoneValid() || countdown > 0 || isGettingCode}
                    hitSlop={hitSlop}
                    testID='login_form.get.code.button'
                >
                    <Text
                        style={[
                            styles.getCodeButtonText,
                            (!phoneNumber || !isPhoneValid() || countdown > 0 || isGettingCode) && styles.getCodeButtonTextDisabled,
                        ]}
                    >
                        {getCodeButtonText()}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* 错误信息 */}
            {error && (
                <Text style={styles.errorText}>
                    {error}
                </Text>
            )}

            {/* 登录按钮 */}
            {proceedButton}

            {/* 昵称输入对话框 */}
            {nicknameModal}
        </View>
    );
};

export default PhoneLoginForm;
