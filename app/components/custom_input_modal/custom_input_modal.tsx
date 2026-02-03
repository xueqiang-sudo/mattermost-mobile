// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {Keyboard, Modal, Text, TextInput, TouchableOpacity, View} from 'react-native';

import {makeStyleSheetFromTheme} from '@utils/theme';

interface CustomInputModalProps {
    visible: boolean;
    title: string;
    placeholder: string;
    defaultValue?: string;
    confirmContent?: string;
    showCancelButton?: boolean;
    cancelContent?: string;
    theme: Theme;
    onConfirm: (value: string) => void;
    onCancel: () => void;
}

const getStyleSheet = makeStyleSheetFromTheme(() => ({
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 24,
        width: '90%',
    },
    modalHeader: {
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#000000',
        textAlign: 'center',
    },
    inputContainer: {
        marginBottom: 32,
        width: '100%',
        flexDirection: 'row',
    },
    input: {
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: '#000000',
        backgroundColor: '#FFFFFF',
        height: 48,
        width: '100%',
    },
    inputPlaceholder: {
        color: '#999999',
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
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    cancelButtonText: {
        color: '#000000',
        fontSize: 16,
        fontWeight: '600',
    },
    confirmButton: {
        backgroundColor: '#FF9500',
    },
    confirmButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    confirmButtonDisabled: {
        backgroundColor: '#FFCC80',
    },
}));

const CustomInputModal: React.FC<CustomInputModalProps> = ({
    visible,
    title = 'Tip',
    placeholder,
    defaultValue = '',
    confirmContent = 'Confirm',
    showCancelButton = true,
    cancelContent = 'Cancel',
    theme,
    onConfirm,
    onCancel,
}) => {
    const styles = getStyleSheet(theme);
    const [inputValue, setInputValue] = useState(defaultValue);

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
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={Keyboard.dismiss}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{title}</Text>
                        </View>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder={placeholder}
                                placeholderTextColor={styles.inputPlaceholder.color}
                                onChangeText={setInputValue}
                                value={inputValue}
                                autoFocus={true}
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
                                    <Text style={styles.cancelButtonText}>{cancelContent}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[styles.button, styles.confirmButton, isInputEmpty && styles.confirmButtonDisabled]}
                                onPress={handleConfirm}
                                activeOpacity={0.7}
                                disabled={isInputEmpty}
                                testID='custom_input_modal.confirm.button'
                            >
                                <Text style={styles.confirmButtonText}>{confirmContent}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </View>
        </Modal>
    );
};

export default CustomInputModal;
