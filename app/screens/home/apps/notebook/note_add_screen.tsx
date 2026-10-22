// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    Text,
    TextInput,
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

import {addNoteEntry} from '../workbench_api';

type NoteAddParams = {
    teamId: string;
    scope: 'private' | 'public';
    title: string;
    onNoteAdded?: () => void;
};

const NoteAddScreen = () => {
    const route = useRoute<RouteProp<{params: NoteAddParams}, 'params'>>();
    const navigation = useNavigation();
    const {teamId, scope, onNoteAdded} = route.params;
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);

    // 保存笔记
    const handleSave = useCallback(async () => {
        if (!content.trim() || loading) {
            return;
        }

        if (!teamId || !serverUrl) {
            Alert.alert(
                intl.formatMessage({id: 'workbench.notebook.error', defaultMessage: 'Error'}),
                'Invalid team ID or server URL',
            );
            return;
        }

        try {
            setLoading(true);
            debugLog('[NoteAdd] Saving note', {teamId, scope, serverUrl});

            const result = await addNoteEntry(serverUrl, teamId, scope, content.trim());

            if (result?.error) {
                throw result.error;
            }

            debugLog('[NoteAdd] Note saved successfully');

            // 调用回调刷新列表
            onNoteAdded?.();

            // 返回上一页
            navigation.goBack();
        } catch (err) {
            debugLog('[NoteAdd] Save failed', {error: String(err)});
            Alert.alert(
                intl.formatMessage({id: 'workbench.notebook.error', defaultMessage: 'Error'}),
                String(err),
            );
        } finally {
            setLoading(false);
        }
    }, [content, loading, teamId, scope, serverUrl, onNoteAdded, intl]);

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
                    {route.params.title || intl.formatMessage({
                        id: 'workbench.notebook.add_title',
                        defaultMessage: 'New Note',
                    })}
                </Text>
                <TouchableOpacity
                    onPress={handleSave}
                    disabled={!content.trim() || loading}
                    style={style.saveButton}
                >
                    <Text style={[
                        style.saveButtonText,
                        (!content.trim() || loading) && style.saveButtonTextDisabled,
                    ]}>
                        {intl.formatMessage({
                            id: 'workbench.notebook.save',
                            defaultMessage: 'Save',
                        })}
                    </Text>
                </TouchableOpacity>
            </View>
            <View style={style.inputContainer}>
                <TextInput
                    style={style.textInput}
                    value={content}
                    onChangeText={setContent}
                    placeholder={intl.formatMessage({
                        id: 'workbench.notebook.add_placeholder',
                        defaultMessage: 'Write your note here...',
                    })}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.44)}
                    multiline={true}
                    textAlignVertical='top'
                    autoFocus={true}
                    autoCapitalize='sentences'
                    scrollEnabled={true}
                />
            </View>
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
    saveButton: {
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
    inputContainer: {
        flex: 1,
        padding: 16,
    },
    textInput: {
        flex: 1,
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        lineHeight: 24,
        padding: 0,
    },
}));

export default NoteAddScreen;
