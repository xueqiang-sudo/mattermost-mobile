// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {defineMessages, type MessageDescriptor, useIntl} from 'react-intl';
import {Alert} from 'react-native';

import {archiveChannel, permanentlyDeleteChannel, unarchiveChannel} from '@actions/remote/channel';
import DeleteOrArchiveModal from '@components/delete_or_archive_modal';
import OptionItem from '@components/option_item';
import {General} from '@constants';
import {useServerUrl} from '@context/server';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissModal, popToRoot} from '@screens/navigation';
import {usesDiscussionGroupChannelCopy} from '@utils/channel';
import {alertErrorWithFallback} from '@utils/draft';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    canArchive: boolean;
    canUnarchive: boolean;
    canViewArchivedChannels: boolean;
    channelId: string;
    componentId: AvailableScreens;
    displayName: string;
    type?: ChannelType;
}

const messages = defineMessages({
    publicChannel: {
        id: 'channel_info.public_channel',
        defaultMessage: 'Public Channel',
    },
    privateChannel: {
        id: 'channel_info.private_channel',
        defaultMessage: 'Group chat',
    },
    alertCancel: {
        id: 'channel_info.alertCancel',
        defaultMessage: 'Cancel',
    },
    alertYes: {
        id: 'channel_info.alertYes',
        defaultMessage: 'Yes',
    },
    archiveFailed: {
        id: 'channel_info.archive_failed',
        defaultMessage: 'An error occurred trying to archive the channel {displayName}',
    },
    unarchiveTitle: {
        id: 'channel_info.unarchive_title',
        defaultMessage: 'Unarchive {term}',
    },
    unarchiveDescription: {
        id: 'channel_info.unarchive_description',
        defaultMessage: 'Are you sure you want to unarchive the {term} {name}?',
    },
    unarchiveFailed: {
        id: 'channel_info.unarchive_failed',
        defaultMessage: 'An error occurred trying to unarchive the channel {displayName}',
    },
    deleteFailed: {
        id: 'channel_info.delete_failed',
        defaultMessage: 'An error occurred trying to delete the channel {displayName}',
    },
});

const Archive = ({
    canArchive, canUnarchive, canViewArchivedChannels,
    channelId, componentId, displayName, type,
}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const [showDeleteOrArchiveModal, setShowDeleteOrArchiveModal] = useState(false);

    const close = useCallback(async (pop: boolean) => {
        await dismissModal({componentId});
        if (pop) {
            popToRoot();
        }
    }, [componentId]);

    const getTerm = useCallback(() => {
        const {formatMessage} = intl;
        if (type === General.OPEN_CHANNEL) {
            return formatMessage(messages.publicChannel);
        }
        return formatMessage(messages.privateChannel);
    }, [intl, type]);

    const alertAndHandleYesAction = useCallback((title: MessageDescriptor, message: MessageDescriptor, onPressAction: () => void) => {
        const {formatMessage} = intl;
        const term = getTerm();

        Alert.alert(
            formatMessage(title, {term}),
            formatMessage(message, {term: term.toLowerCase(), name: displayName}),
            [{
                text: formatMessage(messages.alertCancel),
                style: 'cancel',
            }, {
                text: formatMessage(messages.alertYes),
                onPress: onPressAction,
            }],
        );
    }, [displayName, intl, getTerm]);

    const handleArchive = useCallback(async () => {
        setShowDeleteOrArchiveModal(false);
        const result = await archiveChannel(serverUrl, channelId);
        if (result.error) {
            alertErrorWithFallback(
                intl,
                result.error,
                messages.archiveFailed,
                {displayName},
            );
        } else {
            close(!canViewArchivedChannels);
        }
    }, [serverUrl, channelId, displayName, close, canViewArchivedChannels, intl]);

    const handleDelete = useCallback(async () => {
        setShowDeleteOrArchiveModal(false);
        const result = await permanentlyDeleteChannel(serverUrl, channelId);
        if (result.error) {
            alertErrorWithFallback(
                intl,
                result.error,
                messages.deleteFailed,
                {displayName},
            );
        } else {
            close(true);
        }
    }, [serverUrl, channelId, displayName, close, intl]);

    const handleCancel = useCallback(() => {
        setShowDeleteOrArchiveModal(false);
    }, []);

    const showDeleteOrArchiveDialog = useCallback(() => {
        setShowDeleteOrArchiveModal(true);
    }, []);

    const onArchive = usePreventDoubleTap(useCallback(() => {
        showDeleteOrArchiveDialog();
    }, [showDeleteOrArchiveDialog]));

    const onUnarchive = usePreventDoubleTap(useCallback(() => {
        const title = messages.unarchiveTitle;
        const message = messages.unarchiveDescription;
        const onPressAction = async () => {
            const result = await unarchiveChannel(serverUrl, channelId);
            if (result.error) {
                alertErrorWithFallback(
                    intl,
                    result.error,
                    messages.unarchiveFailed,
                    {displayName},
                );
            } else {
                close(false);
            }
        };
        alertAndHandleYesAction(title, message, onPressAction);
    }, [alertAndHandleYesAction, channelId, close, displayName, intl, serverUrl]));

    if (!canArchive && !canUnarchive) {
        return null;
    }

    const discussionUx = usesDiscussionGroupChannelCopy(type);

    if (canUnarchive) {
        return (
            <OptionItem
                action={onUnarchive}
                label={intl.formatMessage(
                    discussionUx
                        ? {id: 'channel_info.unarchive_discussion_group', defaultMessage: 'Unarchive discussion group'}
                        : {id: 'channel_info.unarchive', defaultMessage: 'Unarchive Channel'},
                )}
                icon='archive-arrow-up-outline'
                destructive={true}
                type='default'
                testID='channel_info.options.unarchive_channel.option'
            />
        );
    }

    return (
        <>
            <OptionItem
                action={onArchive}
                label={intl.formatMessage(
                    discussionUx
                        ? {id: 'channel_info.delete_or_archive_discussion_group', defaultMessage: 'Delete or Archive discussion group'}
                        : {id: 'channel_info.delete_or_archive', defaultMessage: 'Delete or Archive Channel'},
                )}
                icon='archive-outline'
                destructive={true}
                type='default'
                testID='channel_info.options.delete_or_archive_channel.option'
            />
            <DeleteOrArchiveModal
                visible={showDeleteOrArchiveModal}
                displayName={displayName}
                type={type}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onCancel={handleCancel}
            />
        </>
    );
};

export default Archive;
