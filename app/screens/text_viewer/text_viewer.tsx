// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {readAsStringAsync} from 'expo-file-system';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import Markdown from '@components/markdown';
import Highlighter from '@components/syntax_highlight';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    closeButtonId: string;
    filePath: string;
    fileName: string;
    mimeType: string;
    onDismiss?: () => void;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    loading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    error: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        ...typography('Body', 200, 'Regular'),
        color: theme.errorTextColor,
        textAlign: 'center',
        marginTop: 16,
    },
    textContent: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 14,
        lineHeight: 20,
        color: theme.centerChannelColor,
    },
    markdownContent: {
        padding: 16,
    },
}));

const isMarkdownFile = (fileName: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ext === 'md' || ext === 'markdown';
};

const isJsonFile = (fileName: string, mimeType: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ext === 'json' || mimeType === 'application/json';
};

const isCodeFile = (fileName: string, mimeType: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'css', 'html', 'xml', 'yaml', 'yml', 'sh', 'bash'];
    const codeMimeTypes = ['application/xml', 'text/xml', 'text/yaml'];
    return codeExtensions.includes(ext) || codeMimeTypes.includes(mimeType);
};

const TextViewer = ({componentId, closeButtonId, filePath, fileName, mimeType, onDismiss}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const styles = getStyleSheet(theme);
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const onClose = useCallback(() => {
        onDismiss?.();
        return dismissModal({componentId});
    }, [componentId, onDismiss]);

    useNavButtonPressed(closeButtonId, componentId, onClose, [onClose]);
    useAndroidHardwareBackHandler(componentId, onClose);

    const readFileContent = useCallback(async () => {
        try {
            const text = await readAsStringAsync(filePath, {encoding: 'utf8'});
            setContent(text);
            setLoading(false);
        } catch (err) {
            setError(intl.formatMessage({
                id: 'text_viewer.failed_to_read',
                defaultMessage: 'Failed to read file',
            }));
            setLoading(false);
        }
    }, [filePath, intl]);

    useEffect(() => {
        readFileContent();
    }, [readFileContent]);

    const renderContent = () => {
        if (loading) {
            return (
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                    <Text style={styles.errorText}>
                        {intl.formatMessage({
                            id: 'text_viewer.loading',
                            defaultMessage: 'Loading...',
                        })}
                    </Text>
                </View>
            );
        }

        if (error) {
            return (
                <View style={styles.error}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            );
        }

        // Markdown 文件使用 Markdown 渲染
        if (isMarkdownFile(fileName)) {
            return (
                <View style={styles.markdownContent}>
                    <Markdown
                        baseTextStyle={styles.textContent}
                        location={componentId}
                        theme={theme}
                        value={content}
                        disableAtMentions={true}
                        disableChannelMentions={true}
                        disableHashtags={true}
                        channelId=''
                        postId=''
                    />
                </View>
            );
        }

        // JSON 和其他代码文件使用语法高亮
        if (isJsonFile(fileName, mimeType) || isCodeFile(fileName, mimeType)) {
            let language = 'text';
            if (isJsonFile(fileName, mimeType)) {
                language = 'json';
            } else {
                const ext = fileName.split('.').pop()?.toLowerCase() || '';
                language = ext;
            }

            // 尝试格式化 JSON
            let displayContent = content;
            if (isJsonFile(fileName, mimeType)) {
                try {
                    const parsed = JSON.parse(content);
                    displayContent = JSON.stringify(parsed, null, 2);
                } catch (e) {
                    // 如果解析失败，显示原始内容
                }
            }

            return (
                <Highlighter
                    code={displayContent}
                    language={language}
                    textStyle={styles.textContent}
                    selectable={true}
                />
            );
        }

        // 其他文本文件使用等宽字体显示
        return (
            <Text style={styles.textContent} selectable={true}>
                {content}
            </Text>
        );
    };

    return (
        <SafeAreaView
            nativeID={SecurityManager.getShieldScreenId(componentId)}
            style={styles.container}
        >
            <ScrollView
                style={styles.content}
                contentContainerStyle={{flexGrow: 1}}
            >
                {renderContent()}
            </ScrollView>
        </SafeAreaView>
    );
};

export default TextViewer;
