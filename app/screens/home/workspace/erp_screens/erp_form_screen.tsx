// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';

type FormField = {
    key: string;
    label: string;
    type?: 'text' | 'number' | 'select';
    required?: boolean;
    options?: {label: string; value: string}[];
    placeholder?: string;
    defaultValue?: string;
};

type ErpFormScreenProps = {
    navigation: StackNavigationProp<any>;
    route: {params: {mode: 'create' | 'edit'; name?: string; data?: any}};
    fields: FormField[];
    title: string;
    createFn?: (serverUrl: string, body: Record<string, any>) => Promise<any>;
    updateFn?: (serverUrl: string, name: string, body: Record<string, any>) => Promise<any>;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    scrollContent: {
        padding: 16,
    },
    fieldContainer: {
        marginBottom: 16,
    },
    fieldLabel: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 6,
    },
    required: {
        color: theme.errorTextColor,
    },
    textInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: theme.centerChannelColor,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        ...typography('Body', 100, 'Regular'),
    },
    selectContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    selectOption: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    selectOptionActive: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    selectOptionText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    selectOptionTextActive: {
        color: theme.buttonColor,
    },
    submitButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
    },
    submitButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
}));

const ErpFormScreen = ({
    navigation,
    route,
    fields,
    title,
    createFn,
    updateFn,
}: ErpFormScreenProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);

    const {mode, name, data} = route.params;
    const isEdit = mode === 'edit';

    const [form, setForm] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        for (const f of fields) {
            initial[f.key] = isEdit && data ? String(data[f.key] || '') : (f.defaultValue || '');
        }
        return initial;
    });
    const [submitting, setSubmitting] = useState(false);

    const handleChange = useCallback((key: string, value: string) => {
        setForm((prev) => ({...prev, [key]: value}));
    }, []);

    const handleSubmit = useCallback(async () => {
        // Validate required fields
        for (const f of fields) {
            if (f.required && !form[f.key]?.trim()) {
                Alert.alert('Validation', `${f.label} is required`);
                return;
            }
        }

        setSubmitting(true);
        try {
            const body: Record<string, any> = {};
            for (const f of fields) {
                if (form[f.key] !== undefined && form[f.key] !== '') {
                    body[f.key] = f.type === 'number' ? Number(form[f.key]) : form[f.key];
                }
            }

            if (isEdit && updateFn && name) {
                await updateFn(serverUrl, name, body);
            } else if (createFn) {
                await createFn(serverUrl, body);
            }
            navigation.goBack();
        } catch (e: any) {
            Alert.alert('Error', e?.message || String(e));
        } finally {
            setSubmitting(false);
        }
    }, [form, fields, isEdit, name, serverUrl, createFn, updateFn, navigation]);

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps='handled'
            >
                {fields.map((field) => (
                    <View key={field.key} style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>
                            {field.label}
                            {field.required && <Text style={styles.required}> *</Text>}
                        </Text>
                        {field.type === 'select' && field.options ? (
                            <View style={styles.selectContainer}>
                                {field.options.map((opt) => (
                                    <TouchableOpacity
                                        key={opt.value}
                                        style={[styles.selectOption, form[field.key] === opt.value && styles.selectOptionActive]}
                                        onPress={() => handleChange(field.key, opt.value)}
                                    >
                                        <Text style={[styles.selectOptionText, form[field.key] === opt.value && styles.selectOptionTextActive]}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : (
                            <TextInput
                                style={styles.textInput}
                                value={form[field.key]}
                                onChangeText={(val) => handleChange(field.key, val)}
                                placeholder={field.placeholder || ''}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                                keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                                editable={!submitting && !(isEdit && field.key === fields[0].key)}
                            />
                        )}
                    </View>
                ))}

                <TouchableOpacity
                    style={[styles.submitButton, submitting && {opacity: 0.6}]}
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.8}
                >
                    <Text style={styles.submitButtonText}>
                        {submitting
                            ? intl.formatMessage({id: 'erp.submitting', defaultMessage: 'Submitting...'})
                            : isEdit
                                ? intl.formatMessage({id: 'erp.update', defaultMessage: 'Update'})
                                : intl.formatMessage({id: 'erp.create', defaultMessage: 'Create'})
                        }
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
};

export default ErpFormScreen;
