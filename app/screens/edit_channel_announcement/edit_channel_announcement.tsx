// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {Keyboard, StatusBar, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {patchChannel as handlePatchChannel} from '@actions/remote/channel';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {General} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type ChannelModel from '@typings/database/models/servers/channel';
import type ChannelInfoModel from '@typings/database/models/servers/channel_info';
import type {AvailableScreens} from '@typings/screens/navigation';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerTitle: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'center',
    },
    headerButton: {
        padding: 4,
        minWidth: 48,
    },
    doneText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.buttonBg,
        textAlign: 'right',
    },
    closeIcon: {
        padding: 4,
    },
    textInput: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
        textAlignVertical: 'top',
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

type Props = {
    canEdit: boolean;
    channel?: ChannelModel;
    channelInfo?: ChannelInfoModel;
    componentId: AvailableScreens;
    isModal: boolean;
}

const EditChannelAnnouncement = ({
    canEdit,
    channel,
    channelInfo,
    componentId,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const isDM = channel?.type === General.DM_CHANNEL;

    const [text, setText] = useState(channelInfo?.header || '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setText(channelInfo?.header || '');
    }, [channelInfo?.header]);

    const handleClose = useCallback(() => {
        Keyboard.dismiss();
        dismissModal({componentId});
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, handleClose);

    const handleDone = useCallback(async () => {
        if (!channel || !canEdit) {
            return;
        }
        setSaving(true);
        Keyboard.dismiss();
        await handlePatchChannel(serverUrl, channel.id, {header: text});
        setSaving(false);
        dismissModal({componentId});
    }, [channel, canEdit, componentId, serverUrl, text]);

    const title = isDM
        ? intl.formatMessage({id: 'screens.edit_conversation_note', defaultMessage: 'Edit note'})
        : intl.formatMessage({id: 'screens.edit_channel_announcement', defaultMessage: 'Edit Announcement'});

    const placeholder = isDM
        ? intl.formatMessage({id: 'screens.edit_conversation_note.placeholder', defaultMessage: 'e.g. their birthday, important notes, or helpful links'})
        : intl.formatMessage({id: 'screens.edit_channel_announcement.placeholder', defaultMessage: 'e.g. key links, this week\'s focus, or reminders for the team'});

    if (saving) {
        return (
            <View style={styles.container}>
                <StatusBar/>
                <Loading
                    containerStyle={styles.loading}
                    color={theme.centerChannelColor}
                    size='large'
                />
            </View>
        );
    }

    if (!channel) {
        return (
            <View style={styles.container}>
                <StatusBar/>
                <Loading
                    containerStyle={styles.loading}
                    color={theme.centerChannelColor}
                    size='large'
                />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} testID='edit_channel_announcement'>
            <StatusBar/>
            <View style={styles.header}>
                <TouchableOpacity style={styles.closeIcon} onPress={handleClose}>
                    <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{title}</Text>
                <TouchableOpacity style={styles.headerButton} onPress={handleDone} disabled={!canEdit}>
                    <Text style={[styles.doneText, !canEdit && {opacity: 0.38}]}>
                        {intl.formatMessage({id: 'edit_channel_announcement.done', defaultMessage: 'Done'})}
                    </Text>
                </TouchableOpacity>
            </View>
            <TextInput
                style={styles.textInput}
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                multiline={true}
                textAlignVertical='top'
                editable={canEdit}
                testID='edit_channel_announcement.input'
            />
        </SafeAreaView>
    );
};

export default EditChannelAnnouncement;
