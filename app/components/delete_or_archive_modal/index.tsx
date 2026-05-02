// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View} from 'react-native';

import {General} from '@constants';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

interface DeleteOrArchiveModalProps {
    visible: boolean;
    displayName: string;
    type?: ChannelType;
    onArchive: () => void;
    onDelete: () => void;
    onCancel: () => void;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        overlay: {
            flex: 1,
            backgroundColor: changeOpacity('#000', 0.5),
            justifyContent: 'center',
            alignItems: 'center',
        },
        modalContainer: {
            backgroundColor: theme.centerChannelBg,
            borderRadius: 16,
            width: '85%',
            padding: 24,
        },
        title: {
            ...typography('Heading', 200, 'SemiBold'),
            color: theme.centerChannelColor,
            textAlign: 'center',
            marginBottom: 8,
        },
        description: {
            ...typography('Body', 100),
            color: changeOpacity(theme.centerChannelColor, 0.72),
            textAlign: 'center',
            marginBottom: 20,
        },
        actionContainer: {
            marginTop: 8,
        },
        actionCard: {
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
            borderWidth: 1,
        },
        archiveCard: {
            backgroundColor: changeOpacity(theme.buttonBg, 0.08),
            borderColor: changeOpacity(theme.buttonBg, 0.24),
        },
        deleteCard: {
            backgroundColor: changeOpacity('#D32F2F', 0.08),
            borderColor: changeOpacity('#D32F2F', 0.24),
        },
        actionHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 8,
        },
        actionTitle: {
            ...typography('Heading', 200, 'SemiBold'),
        },
        archiveActionTitle: {
            color: theme.buttonBg,
        },
        deleteActionTitle: {
            color: '#D32F2F',
        },
        actionDescription: {
            ...typography('Body', 100),
            lineHeight: 20,
        },
        archiveActionDescription: {
            color: changeOpacity(theme.buttonBg, 0.8),
        },
        deleteActionDescription: {
            color: changeOpacity('#D32F2F', 0.8),
        },
        actionButton: {
            marginTop: 12,
            borderRadius: 8,
            paddingVertical: 10,
            alignItems: 'center',
        },
        archiveButton: {
            backgroundColor: theme.buttonBg,
        },
        deleteButton: {
            backgroundColor: '#D32F2F',
        },
        actionButtonText: {
            ...typography('Heading', 200, 'SemiBold'),
            color: '#FFFFFF',
        },
        cancelButton: {
            marginTop: 8,
            borderRadius: 8,
            paddingVertical: 12,
            alignItems: 'center',
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        },
        cancelButtonText: {
            ...typography('Heading', 200, 'SemiBold'),
            color: theme.centerChannelColor,
        },
    };
});

const DeleteOrArchiveModal = ({visible, displayName, type, onArchive, onDelete, onCancel}: DeleteOrArchiveModalProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const isPublicChannel = type === General.OPEN_CHANNEL;

    const archiveTitle = intl.formatMessage(
        isPublicChannel
            ? {id: 'channel_info.archive_option_public', defaultMessage: 'Archive Group Chat'}
            : {id: 'channel_info.archive_option_private', defaultMessage: 'Archive Group Chat'},
    );

    const archiveDescription = intl.formatMessage(
        isPublicChannel
            ? {
                id: 'channel_info.archive_option_description_full',
                defaultMessage: 'After archiving, this group chat will be removed from the chat list, but all members can still view the historical messages. You can restore it from the archived list at any time.',
            }
            : {
                id: 'channel_info.archive_option_description_full_private',
                defaultMessage: 'After archiving, this group chat will be removed from the chat list, but all members can still view the historical messages. You can restore it from the archived list at any time.',
            },
    );

    const deleteTitle = intl.formatMessage(
        isPublicChannel
            ? {id: 'channel_info.delete_option_public', defaultMessage: 'Delete Group Chat'}
            : {id: 'channel_info.delete_option_private', defaultMessage: 'Delete Group Chat'},
    );

    const deleteDescription = intl.formatMessage(
        isPublicChannel
            ? {
                id: 'channel_info.delete_option_description_full',
                defaultMessage: 'After deletion, all members will permanently lose access to the message history. This action cannot be undone and all data will be irrecoverable.',
            }
            : {
                id: 'channel_info.delete_option_description_full_private',
                defaultMessage: 'After deletion, all members will permanently lose access to the message history. This action cannot be undone and all data will be irrecoverable.',
            },
    );

    const cancelButtonText = intl.formatMessage(
        {id: 'channel_info.cancel_action', defaultMessage: 'Cancel'},
    );

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType='fade'
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <TouchableWithoutFeedback onPress={onCancel}>
                    <View style={StyleSheet.absoluteFill}/>
                </TouchableWithoutFeedback>
                <View
                    style={styles.modalContainer}
                    pointerEvents='box-none'
                >
                    <Text style={styles.title}>
                        {intl.formatMessage(
                            {id: 'channel_info.delete_or_archive_title_full', defaultMessage: 'Delete or Archive Group Chat'},
                        )}
                    </Text>
                    <Text style={styles.description}>
                        {intl.formatMessage(
                            {id: 'channel_info.delete_or_archive_subtitle', defaultMessage: 'Please choose how to handle this group chat:'},
                            {name: displayName},
                        )}
                    </Text>

                    {/* Archive Option */}
                    <View style={[styles.actionCard, styles.archiveCard]}>
                        <View style={styles.actionHeader}>
                            <Text style={[styles.actionTitle, styles.archiveActionTitle]}>
                                {archiveTitle}
                            </Text>
                        </View>
                        <Text style={[styles.actionDescription, styles.archiveActionDescription]}>
                            {archiveDescription}
                        </Text>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.archiveButton]}
                            onPress={onArchive}
                            activeOpacity={0.7}
                            testID='channel_info.archive_option.button'
                        >
                            <Text style={styles.actionButtonText}>
                                {archiveTitle}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Delete Option */}
                    <View style={[styles.actionCard, styles.deleteCard]}>
                        <View style={styles.actionHeader}>
                            <Text style={[styles.actionTitle, styles.deleteActionTitle]}>
                                {deleteTitle}
                            </Text>
                        </View>
                        <Text style={[styles.actionDescription, styles.deleteActionDescription]}>
                            {deleteDescription}
                        </Text>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.deleteButton]}
                            onPress={onDelete}
                            activeOpacity={0.7}
                            testID='channel_info.delete_option.button'
                        >
                            <Text style={styles.actionButtonText}>
                                {deleteTitle}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Cancel Button */}
                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={onCancel}
                        activeOpacity={0.7}
                        testID='channel_info.cancel_option.button'
                    >
                        <Text style={styles.cancelButtonText}>
                            {cancelButtonText}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

export default DeleteOrArchiveModal;
