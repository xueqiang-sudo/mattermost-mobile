// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {getNoteEntry, updateNoteEntry, type NoteDetail} from '../workbench_api';

type NoteDetailParams = {
    noteId: string;
    noteTitle?: string;
    teamId: string;
    scope: 'private' | 'public';
    title: string;
};

const NoteDetailScreen = () => {
    const route = useRoute<RouteProp<{params: NoteDetailParams}, 'params'>>();
    const navigation = useNavigation();
    const {noteId, noteTitle, teamId, scope} = route.params;
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [loading, setLoading] = useState(true);
    const [note, setNote] = useState<NoteDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [saving, setSaving] = useState(false);

    // 加载笔记详情
    const loadNoteDetail = useCallback(async () => {
        if (!noteId || !serverUrl) {
            setError('Invalid note ID or server URL');
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const result = await getNoteEntry(serverUrl, teamId, noteId, scope);

            if (result.error) {
                throw result.error;
            }

            setNote(result.data || null);
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    }, [noteId, serverUrl, teamId, scope]);

    useEffect(() => {
        loadNoteDetail();
    }, [loadNoteDetail]);

    // 开始编辑
    const handleStartEdit = useCallback(() => {
        if (note) {
            setEditContent(note.content || '');
            setIsEditing(true);
        }
    }, [note]);

    // 取消编辑
    const handleCancelEdit = useCallback(() => {
        setIsEditing(false);
        setEditContent('');
    }, []);

    // 保存编辑
    const handleSaveEdit = useCallback(async () => {
        if (!noteId || !serverUrl || !teamId) {
            Alert.alert(
                intl.formatMessage({id: 'workbench.notebook.error', defaultMessage: 'Error'}),
                'Invalid parameters',
            );
            return;
        }

        try {
            setSaving(true);
            await updateNoteEntry(serverUrl, teamId, noteId, scope, {
                content: editContent.trim(),
            });

            // 重新加载笔记
            await loadNoteDetail();
            setIsEditing(false);
            setEditContent('');
        } catch (err) {
            Alert.alert(
                intl.formatMessage({id: 'workbench.notebook.error', defaultMessage: 'Error'}),
                String(err),
            );
        } finally {
            setSaving(false);
        }
    }, [noteId, serverUrl, teamId, scope, editContent, loadNoteDetail, intl]);

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            <View style={style.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={style.backButton}
                >
                    <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle} numberOfLines={1}>
                    {noteTitle || intl.formatMessage({
                        id: 'workbench.notebook.detail_title',
                        defaultMessage: 'Note Detail',
                    })}
                </Text>
                {isEditing ? (
                    <View style={style.headerActions}>
                        <TouchableOpacity
                            onPress={handleCancelEdit}
                            disabled={saving}
                            style={style.headerActionButton}
                        >
                            <Text style={style.cancelButtonText}>
                                {intl.formatMessage({
                                    id: 'workbench.notebook.cancel',
                                    defaultMessage: 'Cancel',
                                })}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleSaveEdit}
                            disabled={saving || !editContent.trim()}
                            style={style.headerActionButton}
                        >
                            <Text style={[
                                style.saveButtonText,
                                (saving || !editContent.trim()) && style.saveButtonTextDisabled,
                            ]}>
                                {saving ? intl.formatMessage({
                                    id: 'workbench.notebook.saving',
                                    defaultMessage: 'Saving...',
                                }) : intl.formatMessage({
                                    id: 'workbench.notebook.save',
                                    defaultMessage: 'Save',
                                })}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity
                        onPress={handleStartEdit}
                        disabled={loading || error !== null}
                        style={style.headerActionButton}
                    >
                        <CompassIcon name='pencil-outline' size={20} color={theme.sidebarText}/>
                    </TouchableOpacity>
                )}
            </View>
            <ScrollView
                style={style.scrollView}
                contentContainerStyle={style.scrollContent}
                bounces={false}
                scrollEventThrottle={16}
            >
                {loading ? (
                    <ActivityIndicator size='large' color={theme.buttonBg} style={style.loading}/>
                ) : error ? (
                    <View style={style.errorContainer}>
                        <CompassIcon name='alert-circle-outline' size={48} color={theme.errorTextColor}/>
                        <Text style={style.errorText}>
                            {intl.formatMessage({
                                id: 'workbench.notebook.load_failed',
                                defaultMessage: 'Failed to load note.',
                            })}
                        </Text>
                        <TouchableOpacity
                            onPress={loadNoteDetail}
                            style={style.retryButton}
                        >
                            <Text style={style.retryButtonText}>
                                {intl.formatMessage({
                                    id: 'workbench.notebook.retry',
                                    defaultMessage: 'Retry',
                                })}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : note ? (
                    isEditing ? (
                        <TextInput
                            style={style.editInput}
                            value={editContent}
                            onChangeText={setEditContent}
                            multiline={true}
                            textAlignVertical='top'
                            autoFocus={true}
                            autoCapitalize='sentences'
                            scrollEnabled={true}
                            placeholder={intl.formatMessage({
                                id: 'workbench.notebook.edit_placeholder',
                                defaultMessage: 'Edit your note...',
                            })}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                        />
                    ) : (
                        <Text style={style.content} selectable={true}>
                            {note.content || intl.formatMessage({
                                id: 'workbench.notebook.empty_content',
                                defaultMessage: '(No content)',
                            })}
                        </Text>
                    )
                ) : (
                    <Text style={style.content}>
                        {intl.formatMessage({
                            id: 'workbench.notebook.not_found',
                            defaultMessage: 'Note not found.',
                        })}
                    </Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    backButton: {
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        color: theme.sidebarText,
        textAlign: 'center',
        ...typography('Heading', 200, 'SemiBold'),
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    loading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    errorContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    errorText: {
        ...typography('Body', 200, 'Regular'),
        color: theme.errorTextColor,
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 24,
    },
    retryButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
    },
    retryButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    content: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        lineHeight: 24,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerActionButton: {
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    saveButtonText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.linkColor,
    },
    saveButtonTextDisabled: {
        color: changeOpacity(theme.linkColor, 0.4),
    },
    cancelButtonText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
    },
    editInput: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        lineHeight: 24,
        flex: 1,
        padding: 0,
    },
}));

export default NoteDetailScreen;
