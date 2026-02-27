// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useRef, useState} from 'react';
import {defineMessages, useIntl, type IntlShape} from 'react-intl';
import {Modal, Text, TextInput, TouchableOpacity, View, FlatList} from 'react-native';

import {checkPhoneRule, splitPhone} from '@utils/form-rule';
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
    close: {
        id: 'phoneInput.close',
        defaultMessage: 'Close',
    },
    validPhone: {
        id: 'phoneInput.validPhone',
        defaultMessage: 'Please enter a valid phone number',
    },
});

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

interface PhoneInputProps {
    defaultValue?: string;
    onChangeText: (text: string) => void;
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
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.3),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 16,
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
    countryName: {
        fontSize: 16,
        color: theme.centerChannelColor,
    },
    countryCode: {
        fontSize: 16,
        color: changeOpacity(theme.centerChannelColor, 0.6),
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
const PhoneInput = ({defaultValue = '', onChangeText, theme, error, placeholder}: PhoneInputProps) => {
    const styles = getStyleSheet(theme);
    const phoneRef = useRef<TextInput>(null);
    const countryCodeRef = useRef<TextInput>(null);
    const intl = useIntl();

    // 状态管理
    const [phoneAreaCodeTmp, phoneTmp] = splitPhone(defaultValue || '');
    const [countryCode, setCountryCode] = useState<string>(phoneAreaCodeTmp || '+86');
    const [phoneNumber, setPhoneNumber] = useState<string>(phoneTmp);
    const [showCountryCodeModal, setShowCountryCodeModal] = useState<boolean>(false);
    const [validationError, setValidationError] = useState<string | undefined>();

    // 手机号失去焦点时验证
    const onPhoneBlur = useCallback(() => {
        // eslint-disable-next-line no-negated-condition
        const errorMsg = !phoneNumber ? undefined : checkPhoneRule(countryCode, phoneNumber);
        setValidationError(errorMsg ? intl.formatMessage(messages.validPhone) : undefined);
    }, [countryCode, phoneNumber, intl]);

    // 区号输入变化处理
    const onCountryCodeChange = useCallback((text: string) => {
        setCountryCode(text);
        setPhoneNumber('');
        onChangeText('');
    }, [onChangeText]);

    // 手机号输入变化处理
    const onPhoneNumberChange = useCallback((text: string) => {
        const numericText = text.replace(/[^0-9]/g, '');
        setPhoneNumber(numericText);
        onChangeText(`${countryCode} ${numericText}`);
    }, [countryCode, onChangeText]);

    // 点击区号输入框，弹出国家列表
    const onCountryCodePress = useCallback(() => setShowCountryCodeModal(true), []);

    // 选择国家/地区
    const onCountrySelect = useCallback((code: string) => {
        setCountryCode(code);
        setPhoneNumber('');
        onChangeText('');
        setShowCountryCodeModal(false);
    }, [onChangeText]);

    // 关闭模态框
    const onCloseModal = useCallback(() => setShowCountryCodeModal(false), []);

    return (
        <View style={styles.container}>
            <View style={styles.phoneNumberContainer}>
                {/* 区号输入 */}
                <TextInput
                    ref={countryCodeRef}
                    style={[
                        styles.countryCodeInput,
                        // styles.countryCodeInputDisabled,
                        error && {borderColor: theme.errorTextColor},
                    ]}
                    value={countryCode}
                    onChangeText={onCountryCodeChange}
                    onFocus={onCountryCodePress}
                    keyboardType='phone-pad'
                    testID='login_form.country.code.input'
                    editable={true}
                />
                {/* 手机号输入 */}
                <View style={styles.phoneNumberInput}>
                    <TextInput
                        ref={phoneRef}
                        style={[
                            styles.countryCodeInput,
                            {width: '100%', textAlign: 'left'},
                            error && {borderColor: theme.errorTextColor},
                        ]}
                        value={phoneNumber}
                        onChangeText={onPhoneNumberChange}
                        onBlur={onPhoneBlur}
                        keyboardType='phone-pad'
                        placeholder={placeholder || intl.formatMessage(messages.enterPhoneNumber)}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.3)}
                        testID='login_form.phone.input'
                    />
                </View>
            </View>

            {/* 错误信息 */}
            {(validationError || error) && (
                <Text style={styles.errorText}>{validationError || error}</Text>
            )}

            {/* 国家列表选择模态框 */}
            <Modal
                visible={showCountryCodeModal}
                animationType='slide'
                transparent={true}
                onRequestClose={onCloseModal}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{intl.formatMessage(messages.selectCountry)}</Text>
                        <FlatList
                            data={COUNTRY_CODES}
                            keyExtractor={(item: { label: string; code: string }) => `${item.label}-${item.code}`}
                            renderItem={({item}) => (
                                <TouchableOpacity
                                    style={styles.countryItem}
                                    onPress={() => onCountrySelect(item.code)}
                                >
                                    <Text style={styles.countryName}>{getAreaIntlMessage(intl, item.label)}</Text>
                                    <Text style={styles.countryCode}>{item.code}</Text>
                                </TouchableOpacity>
                            )}
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
