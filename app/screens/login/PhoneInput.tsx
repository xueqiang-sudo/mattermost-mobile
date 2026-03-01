// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {defineMessages, useIntl, type IntlShape} from 'react-intl';
import {Modal, Text, TextInput, TouchableOpacity, View, FlatList} from 'react-native';

import {checkPhoneRule, splitPhone} from '@utils/form-rule';
import {isEmail} from '@utils/helpers';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';

const messages = defineMessages({
    selectCountry: {
        id: 'phoneInput.selectCountry',
        defaultMessage: 'Select country/region',
    },
    enterPhoneNumber: {
        id: 'phoneInput.enterPhoneNumber',
        defaultMessage: 'Please enter phone number',
    },
    enterEmail: {
        id: 'phoneInput.enterEmail',
        defaultMessage: 'Please enter email',
    },
    enterPhoneOrEmail: {
        id: 'login.phoneOrEmail',
        defaultMessage: 'Phone Number or Email',
    },
    close: {
        id: 'phoneInput.close',
        defaultMessage: 'Close',
    },
    validPhone: {
        id: 'phoneInput.validPhone',
        defaultMessage: 'Please enter a valid phone number',
    },
    validEmail: {
        id: 'phoneInput.validEmail',
        defaultMessage: 'Please enter a valid email',
    },
});

const COUNTRY_CODE_INPUT_FOCUS_DELAY = 260;
const COUNTRY_CODE_FIELD_HEIGHT = 56;

// 国家列表数据
export const COUNTRY_CODES = [
    {label: 'China', code: '+86'},
    {label: 'HongKong', code: '+852'},
    {label: 'Macao', code: '+853'},
    {label: 'Taiwan', code: '+886'},
    {label: 'UnitedStates', code: '+1'},
    {label: 'Russia', code: '+7'},
    {label: 'UnitedKingdom', code: '+44'},
    {label: 'France', code: '+33'},
    {label: 'Germany', code: '+49'},
    {label: 'Japan', code: '+81'},
    {label: 'SouthKorea', code: '+82'},
    {label: 'Singapore', code: '+65'},
    {label: 'Malaysia', code: '+60'},
    {label: 'Thailand', code: '+66'},
    {label: 'Philippines', code: '+63'},
    {label: 'Indonesia', code: '+62'},
    {label: 'Australia', code: '+61'},
    {label: 'NewZealand', code: '+64'},
    {label: 'Italy', code: '+39'},
    {label: 'Switzerland', code: '+41'},
    {label: 'Spain', code: '+34'},
];

const getAreaIntlMessage = (intl: IntlShape, label: string): string => {
    // label 大写之间添加空格
    const formattedLabel = label.replace(/([A-Z])/g, ' $1').trim();

    // 将 label 转换为 intl message 的 key，首字母变成小写，其它大写字母不变
    const intlKey = label.charAt(0).toLowerCase() + label.slice(1);

    return intl.formatMessage({id: `phoneInput.countryArea.${intlKey}`, defaultMessage: formattedLabel});
};

type CountryCodeItem = {
    label: string;
    code: string;
};

interface PhoneInputProps {
    defaultValue?: string;
    onChangeText: (text: string) => void;
    onInputTypeChange?: (isPhoneInput: boolean) => void;
    theme: Theme;
    error?: string;
    placeholder?: string;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        width: '100%',
    },
    phoneNumberContainer: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        width: '100%',
    },
    countryCodeInput: {
        width: 80,
        height: COUNTRY_CODE_FIELD_HEIGHT,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.3),
        borderRadius: 8,
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 12,
        paddingVertical: 0,
        fontSize: 16,
        lineHeight: 20,
        color: theme.centerChannelColor,
        textAlign: 'center',
        textAlignVertical: 'center',
    },
    countryCodeTrigger: {
        width: 80,
        height: COUNTRY_CODE_FIELD_HEIGHT,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.3),
        borderRadius: 8,
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 12,
        paddingVertical: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    countryCodeTriggerText: {
        fontSize: 16,
        lineHeight: 20,
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    countryCodeInputDisabled: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        color: changeOpacity(theme.centerChannelColor, 0.6),
    },
    phoneNumberInput: {
        flex: 1,
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
    countryItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    countryName: {
        fontSize: 16,
        color: theme.centerChannelColor,
    },
    countryNameSelected: {
        color: theme.buttonBg,
        fontFamily: 'OpenSans-SemiBold',
    },
    countryCode: {
        fontSize: 16,
        color: theme.buttonBg,
        fontFamily: 'OpenSans-SemiBold',
    },
    countryCodeSelected: {
        color: theme.buttonBg,
    },
    closeButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.buttonBg,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 120,
        marginTop: 16,
    },
    closeButtonText: {
        color: theme.buttonBg,
        fontSize: 14,
        fontFamily: 'OpenSans-SemiBold',
    },
    errorText: {
        color: theme.errorTextColor,
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
    },
}));

/**
 * PhoneInput 组件 - 封装区号+手机号输入功能
 * 支持手动输入区号和从列表选择国家/地区
 */
const PhoneInput = ({defaultValue = '', onChangeText, onInputTypeChange, theme, error, placeholder}: PhoneInputProps) => {
    const styles = getStyleSheet(theme);
    const phoneRef = useRef<TextInput>(null);
    const countryCodeRef = useRef<TextInput>(null);
    const intl = useIntl();

    // 状态管理
    const [phoneAreaCodeTmp, phoneTmp] = splitPhone(defaultValue || '');
    const trimmedDefaultValue = defaultValue.trim();
    const defaultIsPhoneInput = Boolean(trimmedDefaultValue) && (/^\d+$/.test(trimmedDefaultValue) || Boolean(phoneTmp));
    const [isPhoneInput, setIsPhoneInput] = useState<boolean>(defaultIsPhoneInput);
    const [countryCode, setCountryCode] = useState<string>(phoneAreaCodeTmp || '+86');
    const [inputValue, setInputValue] = useState<string>(defaultIsPhoneInput ? (phoneTmp || trimmedDefaultValue) : trimmedDefaultValue);
    const [showCountryCodeModal, setShowCountryCodeModal] = useState<boolean>(false);
    const [showCountryCodeInput, setShowCountryCodeInput] = useState<boolean>(false);
    const [validationError, setValidationError] = useState<string | undefined>();

    useEffect(() => {
        onInputTypeChange?.(isPhoneInput);
    }, [isPhoneInput, onInputTypeChange]);

    // 输入框失去焦点时校验
    const onInputBlur = useCallback(() => {
        if (!inputValue) {
            setValidationError(undefined);
            return;
        }

        if (isPhoneInput) {
            const errorMsg = checkPhoneRule(countryCode, inputValue);
            setValidationError(errorMsg ? intl.formatMessage(messages.validPhone) : undefined);
            return;
        }

        setValidationError(isEmail(inputValue.trim()) ? undefined : intl.formatMessage(messages.validEmail));
    }, [countryCode, inputValue, intl, isPhoneInput]);

    // 区号输入变化处理
    const onCountryCodeChange = useCallback((text: string) => {
        setCountryCode(text);
        if (isPhoneInput) {
            onChangeText(inputValue ? `${text} ${inputValue}` : '');
        }
    }, [isPhoneInput, inputValue, onChangeText]);

    // 账号输入变化处理（纯数字=手机号，其他=邮箱）
    const onIdentifierChange = useCallback((text: string) => {
        const trimmedText = text.trim();
        const onlyDigits = /^\d+$/.test(trimmedText);

        if (!trimmedText) {
            if (isPhoneInput) {
                setIsPhoneInput(false);
            }
            setInputValue('');
            onChangeText('');
            setValidationError(undefined);
            return;
        }

        if (onlyDigits) {
            if (!isPhoneInput) {
                setIsPhoneInput(true);
            }
            setInputValue(trimmedText);
            onChangeText(trimmedText ? `${countryCode} ${trimmedText}` : '');
        } else {
            if (isPhoneInput) {
                setIsPhoneInput(false);
            }
            setInputValue(text);
            onChangeText(trimmedText);
        }

        setValidationError(undefined);
    }, [countryCode, isPhoneInput, onChangeText]);

    // 点击区号展示框，先弹出国家列表
    const onCountryCodePress = useCallback(() => {
        setShowCountryCodeModal(true);
    }, []);

    const closeModalAndFocusCountryInput = useCallback(() => {
        setShowCountryCodeModal(false);
        setShowCountryCodeInput(true);
        setTimeout(() => {
            countryCodeRef.current?.blur();
            countryCodeRef.current?.focus();
        }, COUNTRY_CODE_INPUT_FOCUS_DELAY);
    }, []);

    // 选择国家/地区
    const onCountrySelect = useCallback((code: string) => {
        setCountryCode(code);
        if (inputValue) {
            onChangeText(`${code} ${inputValue}`);
        }
        setShowCountryCodeModal(false);
        setShowCountryCodeInput(false);
    }, [inputValue, onChangeText]);

    // 关闭模态框
    const onCloseModal = useCallback(() => {
        closeModalAndFocusCountryInput();
    }, [closeModalAndFocusCountryInput]);

    const renderCountryItem = useCallback((data: {item: CountryCodeItem}) => {
        const isSelected = data.item.code === countryCode;
        return (
            <TouchableOpacity
                style={[styles.countryItem, isSelected && styles.countryItemSelected]}
                onPress={() => onCountrySelect(data.item.code)}
            >
                <Text style={[styles.countryName, isSelected && styles.countryNameSelected]}>{getAreaIntlMessage(intl, data.item.label)}</Text>
                <Text style={[styles.countryCode, isSelected && styles.countryCodeSelected]}>{data.item.code}</Text>
            </TouchableOpacity>
        );
    }, [
        countryCode,
        intl,
        onCountrySelect,
        styles.countryCode,
        styles.countryCodeSelected,
        styles.countryItem,
        styles.countryItemSelected,
        styles.countryName,
        styles.countryNameSelected,
    ]);

    let inputPlaceholder = placeholder || intl.formatMessage(messages.enterPhoneOrEmail);
    if (inputValue) {
        inputPlaceholder = intl.formatMessage(isPhoneInput ? messages.enterPhoneNumber : messages.enterEmail);
    }

    return (
        <View style={styles.container}>
            <View style={styles.phoneNumberContainer}>
                {isPhoneInput && (
                    showCountryCodeInput ? (
                        <TextInput
                            ref={countryCodeRef}
                            style={[
                                styles.countryCodeInput,
                                styles.countryCodeInputDisabled,
                                error && {borderColor: theme.errorTextColor},
                            ]}
                            value={countryCode}
                            onChangeText={onCountryCodeChange}
                            onBlur={() => setShowCountryCodeInput(false)}
                            keyboardType='phone-pad'
                            testID='login_form.country.code.input'
                            editable={false}
                        />
                    ) : (
                        <TouchableOpacity
                            style={[
                                styles.countryCodeTrigger,
                                styles.countryCodeInputDisabled,
                                error && {borderColor: theme.errorTextColor},
                            ]}
                            activeOpacity={1}
                            disabled={true}
                            onPress={onCountryCodePress}
                            testID='login_form.country.code.selector'
                        >
                            <Text style={styles.countryCodeTriggerText}>{countryCode}</Text>
                        </TouchableOpacity>
                    )
                )}
                {/* 手机号输入 */}
                <View style={styles.phoneNumberInput}>
                    <TextInput
                        ref={phoneRef}
                        style={[
                            styles.countryCodeInput,
                            {width: '100%', textAlign: 'left'},
                            error && {borderColor: theme.errorTextColor},
                        ]}
                        value={inputValue}
                        onChangeText={onIdentifierChange}
                        onBlur={onInputBlur}
                        keyboardType={isPhoneInput ? 'phone-pad' : 'email-address'}
                        placeholder={inputPlaceholder}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                        testID='login_form.phone.input'
                        autoCapitalize='none'
                        autoCorrect={false}
                    />
                </View>
            </View>

            {/* 错误信息 */}
            {(validationError || error) && (
                <Text style={styles.errorText}>{validationError || error}</Text>
            )}

            {/* 国家列表选择模态框 */}
            <Modal
                visible={showCountryCodeModal && isPhoneInput}
                animationType='slide'
                transparent={true}
                onRequestClose={onCloseModal}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{intl.formatMessage(messages.selectCountry)}</Text>
                        <FlatList<CountryCodeItem>
                            data={COUNTRY_CODES}
                            keyExtractor={(item: { label: string; code: string }) => `${item.label}-${item.code}`}
                            renderItem={renderCountryItem}
                        />
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={onCloseModal}
                        >
                            <Text style={styles.closeButtonText}>{intl.formatMessage(messages.close)}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default PhoneInput;
