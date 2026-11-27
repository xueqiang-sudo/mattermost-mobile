// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useState} from 'react';
import {Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIntl} from 'react-intl';

import {createPost} from '@actions/remote/post';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {dismissModal} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import NetworkManager from '@managers/network_manager';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type {AvailableScreens} from '@typings/screens/navigation';
import type ChannelModel from '@typings/database/models/servers/channel';
import type TeamModel from '@typings/database/models/servers/team';

type ForwardMessageProps = {
    componentId: AvailableScreens;
    postId: string;
    channelId: string;
    message: string;
    fileIds?: string[];
    channels?: ChannelModel[];
    currentChannelId?: string;
    team?: TeamModel | null;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    headerTitle: {
        flex: 1,
        fontSize: 17,
        fontWeight: '600',
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    headerButton: {
        padding: 8,
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    searchInput: {
        height: 36,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 8,
        paddingHorizontal: 12,
        fontSize: 15,
        color: theme.centerChannelColor,
    },
    channelItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    channelItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    channelInfo: {
        flex: 1,
    },
    channelName: {
        fontSize: 16,
        fontWeight: '500',
        color: theme.centerChannelColor,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    emptyText: {
        fontSize: 15,
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
    },
}));

const ForwardMessage = ({
    componentId,
    postId,
    channelId,
    message,
    fileIds,
    channels,
    currentChannelId,
    team,
}: ForwardMessageProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isForwarding, setIsForwarding] = useState(false);

    const filteredChannels = useMemo(() => {
        if (!channels) {
            return [];
        }

        const query = searchQuery.toLowerCase().trim();
        return channels.filter((channel) => {
            // Exclude the source channel
            if (channel.id === channelId) {
                return false;
            }

            // Only show channels from the current team (including DM/GM with empty team_id)
            if (channel.teamId && channel.teamId !== team?.id) {
                return false;
            }

            // Filter by search query
            if (query) {
                const name = channel.displayName?.toLowerCase() || '';
                const channelName = channel.name?.toLowerCase() || '';
                return name.includes(query) || channelName.includes(query);
            }

            return true;
        });
    }, [channels, channelId, searchQuery, team?.id]);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const handleSelectChannel = useCallback((channel: ChannelModel) => {
        setSelectedChannelIds((prev) => {
            if (prev.includes(channel.id)) {
                // Remove from selection
                return prev.filter((id) => id !== channel.id);
            } else {
                // Add to selection
                return [...prev, channel.id];
            }
        });
    }, []);

    const handleForward = useCallback(async () => {
        if (selectedChannelIds.length === 0) {
            Alert.alert(
                intl.formatMessage({id: 'forward.select_channel', defaultMessage: 'Select Channel'}),
                intl.formatMessage({id: 'forward.select_channel_message', defaultMessage: 'Please select a channel to forward the message'}),
            );
            return;
        }

        setIsForwarding(true);

        try {
            // Debug log
            debugLog('[Forward] Starting forward with:', {
                selectedChannelIds,
                message: message?.substring(0, 50),
                fileIds,
                channelId,
                postId,
                team: team?.displayName || 'null',
            });

            // Step 1: Collect file IDs from message (inline markers) and traditional file_ids
            const messageSource = message || '';
            const inlineFileIds: string[] = [];
            const inlineRegex = /!\{file:([a-z0-9_-]+)\}/g;
            let inlineMatch;
            while ((inlineMatch = inlineRegex.exec(messageSource)) !== null) {
                // Skip pending_xxx markers (files being uploaded)
                if (!inlineMatch[1].startsWith('pending_')) {
                    inlineFileIds.push(inlineMatch[1]);
                }
            }

            // Collect traditional file_ids that are not in inline markers
            const traditionalFileIds = (fileIds || []).filter(
                (id) => !inlineFileIds.includes(id),
            );

            const allOriginalFileIds = [...inlineFileIds, ...traditionalFileIds];

            debugLog('[Forward] File IDs:', {
                inlineFileIds,
                traditionalFileIds,
                allOriginalFileIds,
            });

            // Step 2: Copy files on server (like webapp)
            const oldToNewIdMap: Record<string, string> = {};

            if (allOriginalFileIds.length > 0) {
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    debugLog('[Forward] Copying files:', allOriginalFileIds);
                    const copyResult = await client.copyFiles(allOriginalFileIds);
                    debugLog('[Forward] Copy result:', copyResult);
                    const newIds = copyResult.file_ids;

                    // Map old IDs to new IDs
                    allOriginalFileIds.forEach((oldId, index) => {
                        const newId = newIds[index];
                        if (newId) {
                            oldToNewIdMap[oldId] = newId;
                        }
                    });
                    debugLog('[Forward] File ID mapping:', oldToNewIdMap);
                } catch (copyError: any) {
                    debugLog('[Forward] File copy failed:', copyError?.message || String(copyError));
                    // File copy failed - abort forwarding
                    throw copyError;
                }
            }

            // Step 3: Rebuild message with new file IDs
            let forwardMessage = messageSource;

            // Replace inline markers: !{file:oldId} → !{file:newId}
            forwardMessage = forwardMessage.replace(
                /!\{file:([a-z0-9_-]+)\}/g,
                (fullMatch, oldId) => {
                    const newId = oldToNewIdMap[oldId];
                    return newId ? `!{file:${newId}}` : '';
                },
            );

            // Append traditional file_ids as new inline markers
            const appendedMarkers = traditionalFileIds
                .filter((oldId) => oldToNewIdMap[oldId])
                .map((oldId) => `!{file:${oldToNewIdMap[oldId]}}`)
                .join('\n');

            if (appendedMarkers) {
                forwardMessage = forwardMessage.trim()
                    ? `${forwardMessage.trim()}\n${appendedMarkers}`
                    : appendedMarkers;
            }

            forwardMessage = forwardMessage.trim();

            debugLog('[Forward] Forward message:', forwardMessage.substring(0, 100));

            // Get new file IDs for the post
            const newFileIds = allOriginalFileIds
                .map((oldId) => oldToNewIdMap[oldId])
                .filter(Boolean);

            debugLog('[Forward] New file IDs:', newFileIds);

            // Step 4: Create the forwarded post for each selected channel
            for (const targetChannelId of selectedChannelIds) {
                const post = {
                    channel_id: targetChannelId,
                    message: forwardMessage,
                    file_ids: newFileIds,  // Use new copied file IDs
                    root_id: '',
                    props: {
                        forwarded_from: {
                            channel_id: channelId,
                            post_id: postId,
                        },
                    },
                };

                debugLog('[Forward] Creating post in channel:', targetChannelId, post);
                const result = await createPost(serverUrl, post);
                debugLog('[Forward] Post created result:', result);
                if (result.error) {
                    debugLog('[Forward] Create post error:', result.error);
                    throw result.error;
                }
            }

            // Close the modal
            handleClose();
        } catch (error: any) {
            debugLog('[Forward] Error:', error?.message || String(error));
            Alert.alert(
                intl.formatMessage({id: 'forward.error', defaultMessage: 'Forward Failed'}),
                error?.message || intl.formatMessage({id: 'forward.error_message', defaultMessage: 'Failed to forward the message. Please try again.'}),
            );
        } finally {
            setIsForwarding(false);
        }
    }, [selectedChannelIds, message, fileIds, postId, channelId, serverUrl, intl, handleClose]);

    const renderChannelItem = useCallback(({item: channel}: {item: ChannelModel}) => {
        const isSelected = selectedChannelIds.includes(channel.id);

        return (
            <Pressable
                style={[styles.channelItem, isSelected && styles.channelItemSelected]}
                onPress={() => handleSelectChannel(channel)}
            >
                <View style={{
                    marginRight: 12,
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <CompassIcon
                        name='account-multiple-outline'
                        size={24}
                        color={changeOpacity(theme.centerChannelColor, 0.56)}
                    />
                </View>
                <View style={styles.channelInfo}>
                    <Text style={styles.channelName} numberOfLines={1}>
                        {channel.displayName || channel.name}
                    </Text>
                </View>
                {isSelected && (
                    <CompassIcon
                        name='check'
                        size={24}
                        color={theme.buttonBg}
                    />
                )}
            </Pressable>
        );
    }, [selectedChannelIds, handleSelectChannel, styles, theme]);

    const renderEmptyState = useCallback(() => (
        <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
                {searchQuery ?
                    intl.formatMessage({id: 'forward.no_channels_found', defaultMessage: 'No channels found'}) :
                    intl.formatMessage({id: 'forward.no_channels', defaultMessage: 'No channels available'})
                }
            </Text>
        </View>
    ), [searchQuery, styles, intl]);

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <Pressable style={styles.headerButton} onPress={handleClose}>
                    <CompassIcon
                        name='close'
                        size={24}
                        color={theme.centerChannelColor}
                    />
                </Pressable>
                <View style={{flex: 1}} />
                <Pressable
                    style={styles.headerButton}
                    onPress={handleForward}
                    disabled={selectedChannelIds.length === 0 || isForwarding}
                >
                    <Text style={{
                        fontSize: 17,
                        fontWeight: '600',
                        color: selectedChannelIds.length > 0 && !isForwarding ? theme.buttonBg : changeOpacity(theme.buttonBg, 0.4),
                    }}>
                        {selectedChannelIds.length > 0
                            ? `${intl.formatMessage({id: 'forward.send', defaultMessage: 'Send'})} (${selectedChannelIds.length})`
                            : intl.formatMessage({id: 'forward.send', defaultMessage: 'Send'})
                        }
                    </Text>
                </Pressable>
            </View>

            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder={intl.formatMessage({id: 'forward.search_placeholder', defaultMessage: 'Search groups...'})}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.56)}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize='none'
                    autoCorrect={false}
                />
            </View>

            <FlatList
                data={filteredChannels}
                renderItem={renderChannelItem}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={renderEmptyState}
            />
        </SafeAreaView>
    );
};

export default ForwardMessage;
