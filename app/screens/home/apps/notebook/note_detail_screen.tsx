// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {debugLog} from '@store/debug_log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {getNoteEntry, type NoteDetail} from '../workbench_api';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    noteId: string;
    noteTitle?: string;
};

const NoteDetailScreen = ({noteId, noteTitle}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [loading, setLoading] = useState(true);
    const [note, setNote] = useState<NoteDetail | null>(null);
    const [error, setError] = useState<string | null>(null);

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
            debugLog('[NoteDetail] Loading note', {noteId, serverUrl});

            const result = await getNoteEntry(serverUrl, noteId);

            if (result.error) {
                throw result.error;
            }

            setNote(result.data || null);
            debugLog('[NoteDetail] Note loaded', {hasData: Boolean(result.data)});
        } catch (err) {
            debugLog('[NoteDetail] Load failed', {error: String(err)});
            setError(String(err));
        } finally {
            setLoading(false);
        }
    }, [noteId, serverUrl]);

    useEffect(() => {
        loadNoteDetail();
    }, [loadNoteDetail]);

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
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
                    <Text style={style.content} selectable={true}>
                        {note.content || intl.formatMessage({
                            id: 'workbench.notebook.empty_content',
                            defaultMessage: '(No content)',
                        })}
                    </Text>
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
    backButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
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
}));

export default NoteDetailScreen;
