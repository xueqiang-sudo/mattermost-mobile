// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {Keyboard, Modal, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View} from 'react-native';

import {useTheme} from '@context/theme';
import {changeOpacity, getKeyboardAppearanceFromTheme} from '@utils/theme';

interface CustomInputModalProps {
    visible: boolean;
    title: string;
    placeholder: string;
    defaultValue?: string;
    confirmContent?: string;
    showCancelButton?: boolean;
    cancelContent?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
}

/** 不用 makeStyleSheetFromTheme 的全局缓存，避免 theme 引用未变时切换主题不刷新 */
function createStyles(theme: Theme) {
    return StyleSheet.create({
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
            width: '90%',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: changeOpacity(theme.centerChannelColor, 0.12),
        },
        modalHeader: {
            marginBottom: 24,
        },
        modalTitle: {
            fontSize: 18,
            fontWeight: 'bold',
            color: theme.centerChannelColor,
            textAlign: 'center',
        },
        inputContainer: {
            marginBottom: 32,
            width: '100%',
            flexDirection: 'row',
        },
        input: {
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.16),
            borderRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 12,
            fontSize: 16,
            color: theme.centerChannelColor,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
            height: 48,
            width: '100%',
        },
        buttonContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 16,
            width: '100%',
        },
        button: {
            flex: 1,
            height: 48,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 8,
        },
        cancelButton: {
            backgroundColor: theme.centerChannelBg,
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.2),
        },
        cancelButtonText: {
            color: theme.centerChannelColor,
            fontSize: 16,
            fontWeight: '600',
        },
        confirmButton: {
            backgroundColor: theme.buttonBg,
        },
        confirmButtonText: {
            color: theme.buttonColor,
            fontSize: 16,
            fontWeight: '600',
        },
        confirmButtonDisabled: {
            backgroundColor: changeOpacity(theme.buttonBg, 0.45),
        },
    });
}

const CustomInputModal: React.FC<CustomInputModalProps> = ({
    visible,
    title = 'Tip',
    placeholder,
    defaultValue = '',
    confirmContent,
    showCancelButton = true,
    cancelContent,
    onConfirm,
    onCancel,
}) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = useMemo(
        () => createStyles(theme),
        [
            theme.centerChannelBg,
            theme.centerChannelColor,
            theme.buttonBg,
            theme.buttonColor,
        ],
    );
    const placeholderColor = useMemo(
        () => changeOpacity(theme.centerChannelColor, 0.5),
        [theme.centerChannelColor],
    );

    const defaultConfirm = intl.formatMessage({id: 'common.confirm', defaultMessage: 'Confirm'});
    const defaultCancel = intl.formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'});
    const [inputValue, setInputValue] = useState(defaultValue);

    useEffect(() => {
        if (visible) {
            setInputValue(defaultValue);
        }
    }, [visible, defaultValue]);

    const handleConfirm = useCallback(() => {
        if (inputValue.trim()) {
            onConfirm(inputValue.trim());
        }
    }, [inputValue, onConfirm]);

    const handleCancel = useCallback(() => {
        onCancel();
    }, [onCancel]);

    const isInputEmpty = !inputValue.trim();

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType='fade'
            onRequestClose={handleCancel}
        >
            <View style={styles.modalContainer}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={StyleSheet.absoluteFill}/>
                </TouchableWithoutFeedback>
                <View
                    style={styles.modalContent}
                    pointerEvents='box-none'
                >
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{title}</Text>
                    </View>
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder={placeholder}
                            placeholderTextColor={placeholderColor}
                            onChangeText={setInputValue}
                            value={inputValue}
                            autoFocus={true}
                            keyboardAppearance={getKeyboardAppearanceFromTheme(theme)}
                            selectionColor={theme.buttonBg}
                            underlineColorAndroid='transparent'
                            testID='custom_input_modal.input'
                        />
                    </View>
                    <View style={styles.buttonContainer}>
                        {showCancelButton && (
                            <TouchableOpacity
                                style={[styles.button, styles.cancelButton]}
                                onPress={handleCancel}
                                activeOpacity={0.7}
                                testID='custom_input_modal.cancel.button'
                            >
                                <Text style={styles.cancelButtonText}>{cancelContent ?? defaultCancel}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.button, styles.confirmButton, isInputEmpty && styles.confirmButtonDisabled]}
                            onPress={handleConfirm}
                            activeOpacity={0.7}
                            disabled={isInputEmpty}
                            testID='custom_input_modal.confirm.button'
                        >
                            <Text style={styles.confirmButtonText}>{confirmContent ?? defaultConfirm}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

export default CustomInputModal;
