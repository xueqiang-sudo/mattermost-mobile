// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

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

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    teamId: string;
    scope: 'private' | 'public';
    onNoteAdded?: () => void;
};

const NoteAddScreen = ({teamId, scope, onNoteAdded}: Props) => {
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

            const result = await addNoteEntry(serverUrl, teamId, content.trim(), scope);

            if (result?.error) {
                throw result.error;
            }

            debugLog('[NoteAdd] Note saved successfully');

            // 调用回调刷新列表
            if ((route.params as NoteAddScreenRouteParams)?.onNoteAdded) {
                (route.params as NoteAddScreenRouteParams).onNoteAdded!();
            }

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
    }, [content, loading, teamId, scope, serverUrl, navigation, route.params, intl]);

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
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
    backButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    saveButton: {
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
