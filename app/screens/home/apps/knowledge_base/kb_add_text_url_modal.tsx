// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {debugLog} from '@store/debug_log';

import {createKBDocText, createKBDocURL} from '../workbench_api';

type AddKBModalType = 'text' | 'url';

interface KBAddTextURLModalProps {
    visible: boolean;
    type: AddKBModalType;
    onClose: () => void;
    onSuccess: () => void;
    serverUrl: string;
    teamId: string;
}

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    overlay: {
        flex: 1,
        backgroundColor: changeOpacity('#000', 0.5),
        justifyContent: 'flex-end',
    },
    modal: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '90%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    title: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    closeButton: {
        padding: 4,
    },
    body: {
        padding: 16,
    },
    formGroup: {
        marginBottom: 16,
    },
    label: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    required: {
        color: theme.errorTextColor,
    },
    input: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
    },
    textArea: {
        minHeight: 120,
        textAlignVertical: 'top',
    },
    hint: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 4,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 20,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        gap: 6,
    },
    cancelButton: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    submitButton: {
        backgroundColor: theme.buttonBg,
    },
    submitButtonDisabled: {
        opacity: 0.5,
    },
    cancelButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    submitButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    error: {
        backgroundColor: changeOpacity(theme.errorTextColor, 0.1),
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    errorText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.errorTextColor,
    },
}));

// ---- Component ----

const KBAddTextURLModal: React.FC<KBAddTextURLModalProps> = ({
    visible,
    type,
    onClose,
    onSuccess,
    serverUrl,
    teamId,
}) => {
    const intl = useIntl();
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const insets = useSafeAreaInsets();

    // State
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [url, setUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Validation
    const canSubmit = useMemo(() => {
        if (isSubmitting) return false;

        if (type === 'text') {
            return title.trim().length > 0 && content.trim().length > 0;
        } else if (type === 'url') {
            return title.trim().length > 0 && url.trim().length > 0 && isValidUrl(url);
        }
        return false;
    }, [type, title, content, url, isSubmitting]);

    // URL validation
    const isValidUrl = (urlString: string): boolean => {
        try {
            new URL(urlString);
            return true;
        } catch {
            return false;
        }
    };

    // Get modal title
    const getTitle = useCallback(() => {
        if (type === 'text') {
            return intl.formatMessage({
                id: 'workbench.kb.add_text',
                defaultMessage: '添加文本文档',
            });
        } else {
            return intl.formatMessage({
                id: 'workbench.kb.add_url',
                defaultMessage: '从链接导入',
            });
        }
    }, [type, intl]);

    // Submit handler
    const handleSubmit = useCallback(async () => {
        if (!canSubmit || !teamId) return;

        setIsSubmitting(true);
        setError(null);

        try {
            debugLog(`[KBAddTextURLModal] Submitting ${type} document:`, JSON.stringify({
                teamId,
                title: title.trim(),
                hasContent: content.trim().length > 0,
                url: url.trim(),
            }));

            if (type === 'text') {
                await createKBDocText(
                    serverUrl,
                    teamId,
                    title.trim(),
                    content.trim(),
                );
                debugLog('[KBAddTextURLModal] Text document created successfully');
            } else if (type === 'url') {
                await createKBDocURL(
                    serverUrl,
                    teamId,
                    title.trim(),
                    url.trim(),
                );
                debugLog('[KBAddTextURLModal] URL document created successfully');
            }

            // Reset form
            setTitle('');
            setContent('');
            setUrl('');

            // Close and trigger success callback
            onClose();
            onSuccess();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            debugLog('[KBAddTextURLModal] Error:', errorMsg);
            setError(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    }, [type, title, content, url, teamId, serverUrl, canSubmit, onClose, onSuccess]);

    // Reset on close
    const handleClose = useCallback(() => {
        setTitle('');
        setContent('');
        setUrl('');
        setError(null);
        onClose();
    }, [onClose]);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={handleClose}
        >
            <SafeAreaView edges={['top', 'bottom']} style={{flex: 1, backgroundColor: theme.centerChannelBg}}>
                <View style={style.header}>
                    <Text style={style.title}>{getTitle()}</Text>
                    <TouchableOpacity style={style.closeButton} onPress={handleClose}>
                        <CompassIcon name="close" size={24} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={style.body}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{paddingBottom: insets.bottom + 16}}
                >
                    {error && (
                        <View style={style.error}>
                            <Text style={style.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* Title field - both text and url modes */}
                    <View style={style.formGroup}>
                        <Text style={style.label}>
                            {intl.formatMessage({id: 'workbench.kb.title', defaultMessage: '标题'})}
                            <Text style={style.required}> *</Text>
                        </Text>
                        <TextInput
                            style={style.input}
                            placeholder={intl.formatMessage({
                                id: 'workbench.kb.title_placeholder',
                                defaultMessage: '请输入标题',
                            })}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                            value={title}
                            onChangeText={setTitle}
                            editable={!isSubmitting}
                        />
                    </View>

                    {/* Content field - text mode only */}
                    {type === 'text' && (
                        <View style={style.formGroup}>
                            <Text style={style.label}>
                                {intl.formatMessage({id: 'workbench.kb.content', defaultMessage: '内容'})}
                                <Text style={style.required}> *</Text>
                            </Text>
                            <TextInput
                                style={[style.input, style.textArea]}
                                placeholder={intl.formatMessage({
                                    id: 'workbench.kb.content_placeholder',
                                    defaultMessage: '输入文档内容...',
                                })}
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                                value={content}
                                onChangeText={setContent}
                                multiline={true}
                                editable={!isSubmitting}
                            />
                        </View>
                    )}

                    {/* URL field - url mode only */}
                    {type === 'url' && (
                        <View style={style.formGroup}>
                            <Text style={style.label}>
                                URL<Text style={style.required}> *</Text>
                            </Text>
                            <TextInput
                                style={style.input}
                                placeholder="https://example.com"
                                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                                value={url}
                                onChangeText={setUrl}
                                keyboardType="url"
                                editable={!isSubmitting}
                            />
                            <Text style={style.hint}>
                                {intl.formatMessage({
                                    id: 'workbench.kb.url_hint',
                                    defaultMessage: '输入完整的URL，例如 https://example.com/article',
                                })}
                            </Text>
                        </View>
                    )}

                    {/* Action buttons */}
                    <View style={style.actions}>
                        <TouchableOpacity
                            style={[style.actionButton, style.cancelButton]}
                            onPress={handleClose}
                            disabled={isSubmitting}
                        >
                            <Text style={style.cancelButtonText}>
                                {intl.formatMessage({id: 'workbench.kb.cancel', defaultMessage: '取消'})}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                style.actionButton,
                                style.submitButton,
                                !canSubmit && style.submitButtonDisabled,
                            ]}
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator size="small" color={theme.buttonColor}/>
                            ) : (
                                <Text style={style.submitButtonText}>
                                    {type === 'text'
                                        ? intl.formatMessage({id: 'workbench.kb.save', defaultMessage: '保存'})
                                        : intl.formatMessage({id: 'workbench.kb.import', defaultMessage: '导入'})
                                    }
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </Modal>
    );
};

export default KBAddTextURLModal;
