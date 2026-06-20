// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';

import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Props = {
    label: string;
    value: string;
    placeholder?: string;
    onSave: (newValue: string) => void;
    testID?: string;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    label: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 6,
        ...typography('Body', 75, 'SemiBold'),
    },
    inputWrapper: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    input: {
        color: theme.centerChannelColor,
        ...typography('Body', 200),
        padding: 0,
    },
}));

const EditableField = ({label, value, placeholder, onSave, testID}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleBlur = useCallback(() => {
        const trimmed = localValue.trim();
        if (trimmed && trimmed !== value) {
            onSave(trimmed);
        }
    }, [localValue, value, onSave]);

    const handleSubmit = useCallback(() => {
        handleBlur();
    }, [handleBlur]);

    return (
        <View style={styles.container} testID={testID}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.inputWrapper}>
                <TextInput
                    style={styles.input}
                    value={localValue}
                    onChangeText={setLocalValue}
                    onBlur={handleBlur}
                    onSubmitEditing={handleSubmit}
                    placeholder={placeholder}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.45)}
                    returnKeyType='done'
                    testID={`${testID}.input`}
                />
            </View>
        </View>
    );
};

export default EditableField;
