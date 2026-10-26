// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import DocumentPicker, {type DocumentPickerResponse} from 'react-native-document-picker';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {popTopScreen} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

import {
    createKBDocText,
    createKBDocURL,
    createKBDocFile,
} from '../workbench_api';

type AddDocType = 'text' | 'url' | 'file';

type Props = {
    componentId: AvailableScreens;
    teamId: string;
    onDocAdded?: () => void;
};

const KBAddScreen = ({teamId, onDocAdded}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [addType, setAddType] = useState<AddDocType>('text');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [url, setUrl] = useState('');
    const [file, setFile] = useState<DocumentPickerResponse | null>(null);
    const [loading, setLoading] = useState(false);

    // 检查是否可以保存
    const canSave = useCallback(() => {
        if (addType === 'text') {
            return title.trim().length > 0 && content.trim().length > 0;
        } else if (addType === 'url') {
            return title.trim().length > 0 && url.trim().length > 0;
        } else if (addType === 'file') {
            return file !== null;
        }
        return false;
    }, [addType, title, content, url, file]);

    // 选择文件
    const handlePickFile = useCallback(async () => {
        try {
            const result = await DocumentPicker.pick({
                type: [DocumentPicker.types.allFiles],
                copyTo: 'cachesDirectory',
            });

            if (result && result.length > 0) {
                setFile(result[0]);
                if (!title.trim()) {
                    setTitle(result[0].name);
                }
                debugLog('[KBAdd] File picked', JSON.stringify({name: result[0].name, size: result[0].size}));
            }
        } catch (err) {
            if (!DocumentPicker.isCancel(err)) {
                debugLog('[KBAdd] Pick file failed', {error: String(err)});
                Alert.alert(
                    intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                    String(err),
                );
            }
        }
    }, [intl, title]);

    // 保存
    const handleSave = useCallback(async () => {
        if (loading || !canSave() || !teamId || !serverUrl) {
            return;
        }

        try {
            setLoading(true);
            debugLog('[KBAdd] Saving document', {
                teamId,
                addType,
                titleLength: title.trim().length,
                contentLength: content.trim().length,
                urlLength: url.trim().length,
                hasFile: Boolean(file),
            });

            let result;
            if (addType === 'text') {
                result = await createKBDocText(serverUrl, teamId, title.trim(), content.trim());
            } else if (addType === 'url') {
                result = await createKBDocURL(serverUrl, teamId, title.trim(), url.trim());
            } else if (addType === 'file' && file) {
                result = await createKBDocFile(serverUrl, teamId, file);
            }

            if (result?.error) {
                throw new Error(result.error);
            }

            debugLog('[KBAdd] Document saved successfully');

            // 调用回调刷新列表
            onDocAdded?.();

            // 返回上一页
            popTopScreen();
        } catch (err) {
            debugLog('[KBAdd] Save failed', {error: String(err)});
            Alert.alert(
                intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
                `${intl.formatMessage({
                    id: 'workbench.kb.add_failed',
                    defaultMessage: 'Failed to add document',
                })}: ${String(err)}`,
            );
        } finally {
            setLoading(false);
        }
    }, [loading, canSave, teamId, serverUrl, addType, title, content, url, file, onDocAdded, intl]);

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* 类型选择 */}
            <View style={style.typeSelector}>
                <TouchableOpacity
                    style={[style.typeButton, addType === 'text' && style.typeButtonActive]}
                    onPress={() => setAddType('text')}
                >
                    <CompassIcon
                        name='text-box-outline'
                        size={20}
                        color={addType === 'text' ? theme.buttonBg : theme.centerChannelColor}
                    />
                    <Text
                        style={[
                            style.typeButtonText,
                            addType === 'text' && style.typeButtonTextActive,
                        ]}
                    >
                        {intl.formatMessage({
                            id: 'workbench.kb.type_text',
                            defaultMessage: 'Text',
                        })}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[style.typeButton, addType === 'url' && style.typeButtonActive]}
                    onPress={() => setAddType('url')}
                >
                    <CompassIcon
                        name='link-variant'
                        size={20}
                        color={addType === 'url' ? theme.buttonBg : theme.centerChannelColor}
                    />
                    <Text
                        style={[
                            style.typeButtonText,
                            addType === 'url' && style.typeButtonTextActive,
                        ]}
                    >
                        {intl.formatMessage({
                            id: 'workbench.kb.type_url',
                            defaultMessage: 'URL',
                        })}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[style.typeButton, addType === 'file' && style.typeButtonActive]}
                    onPress={() => setAddType('file')}
                >
                    <CompassIcon
                        name='file-document-outline'
                        size={20}
                        color={addType === 'file' ? theme.buttonBg : theme.centerChannelColor}
                    />
                    <Text
                        style={[
                            style.typeButtonText,
                            addType === 'file' && style.typeButtonTextActive,
                        ]}
                    >
                        {intl.formatMessage({
                            id: 'workbench.kb.type_file',
                            defaultMessage: 'File',
                        })}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* 表单 */}
            <View style={style.form}>
                {/* 标题输入（文件类型时隐藏） */}
                {addType !== 'file' && (
                    <View style={style.inputContainer}>
                        <Text style={style.label}>
                            {intl.formatMessage({
                                id: 'workbench.kb.title',
                                defaultMessage: 'Title',
                            })}
                        </Text>
                        <TextInput
                            style={style.textInput}
                            value={title}
                            onChangeText={setTitle}
                            placeholder={intl.formatMessage({
                                id: 'workbench.kb.title_placeholder',
                                defaultMessage: 'Enter title',
                            })}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                            autoCapitalize='sentences'
                        />
                    </View>
                )}

                {/* 文本类型：内容输入 */}
                {addType === 'text' && (
                    <View style={style.inputContainer}>
                        <Text style={style.label}>
                            {intl.formatMessage({
                                id: 'workbench.kb.content',
                                defaultMessage: 'Content',
                            })}
                        </Text>
                        <TextInput
                            style={[style.textInput, style.textArea]}
                            value={content}
                            onChangeText={setContent}
                            placeholder={intl.formatMessage({
                                id: 'workbench.kb.content_placeholder',
                                defaultMessage: 'Enter content',
                            })}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                            multiline={true}
                            textAlignVertical='top'
                            autoCapitalize='sentences'
                        />
                    </View>
                )}

                {/* URL 类型：URL 输入 */}
                {addType === 'url' && (
                    <View style={style.inputContainer}>
                        <Text style={style.label}>
                            {intl.formatMessage({
                                id: 'workbench.kb.url',
                                defaultMessage: 'URL',
                            })}
                        </Text>
                        <TextInput
                            style={style.textInput}
                            value={url}
                            onChangeText={setUrl}
                            placeholder='https://example.com/document.pdf'
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                            autoCapitalize='none'
                            autoCorrect={false}
                            keyboardType='url'
                        />
                    </View>
                )}

                {/* 文件类型：文件选择 */}
                {addType === 'file' && (
                    <View style={style.inputContainer}>
                        <Text style={style.label}>
                            {intl.formatMessage({
                                id: 'workbench.kb.file',
                                defaultMessage: 'File',
                            })}
                        </Text>
                        <TouchableOpacity
                            style={style.filePicker}
                            onPress={handlePickFile}
                        >
                            {file ? (
                                <View style={style.fileInfo}>
                                    <CompassIcon
                                        name='file-document-outline'
                                        size={24}
                                        color={theme.linkColor}
                                    />
                                    <View style={style.fileDetails}>
                                        <Text style={style.fileName} numberOfLines={1}>
                                            {file.name}
                                        </Text>
                                        <Text style={style.fileSize}>
                                            {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                                        </Text>
                                    </View>
                                    <CompassIcon
                                        name='check-circle'
                                        size={24}
                                        color={theme.onlineIndicator}
                                    />
                                </View>
                            ) : (
                                <View style={style.filePlaceholder}>
                                    <CompassIcon
                                        name='file-upload-outline'
                                        size={32}
                                        color={changeOpacity(theme.centerChannelColor, 0.44)}
                                    />
                                    <Text style={style.filePlaceholderText}>
                                        {intl.formatMessage({
                                            id: 'workbench.kb.tap_to_select',
                                            defaultMessage: 'Tap to select file',
                                        })}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    headerButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    saveButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.linkColor,
    },
    saveButtonTextDisabled: {
        color: changeOpacity(theme.linkColor, 0.4),
    },
    typeSelector: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    typeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginHorizontal: 4,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    typeButtonActive: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
    },
    typeButtonText: {
        ...typography('Body', 75, 'Regular'),
        color: theme.centerChannelColor,
        marginLeft: 6,
    },
    typeButtonTextActive: {
        color: theme.buttonBg,
        fontWeight: '600',
    },
    form: {
        flex: 1,
        padding: 16,
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    textInput: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        padding: 12,
        backgroundColor: theme.centerChannelBg,
    },
    textArea: {
        height: 200,
        textAlignVertical: 'top',
    },
    filePicker: {
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderStyle: 'dashed',
        borderRadius: 8,
        padding: 24,
    },
    fileInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    fileDetails: {
        flex: 1,
        marginLeft: 12,
    },
    fileName: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    fileSize: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    filePlaceholder: {
        alignItems: 'center',
    },
    filePlaceholderText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 12,
    },
}));

export default KBAddScreen;
