// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useMemo, useState} from 'react';
import {Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIntl} from 'react-intl';
import {of} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {createPost} from '@actions/remote/post';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type {AvailableScreens} from '@typings/screens/navigation';
import type ChannelModel from '@typings/database/models/servers/channel';
import type {WithDatabaseArgs} from '@typings/database/database';

type ForwardMessageProps = {
    componentId: AvailableScreens;
    postId: string;
    channelId: string;
    message: string;
    fileIds?: string[];
    channels?: ChannelModel[];
    currentChannelId?: string;
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
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    checkboxSelected: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    channelIcon: {
        width: 40,
        height: 40,
        borderRadius: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    channelInfo: {
        flex: 1,
    },
    channelName: {
        fontSize: 16,
        fontWeight: '500',
        color: theme.centerChannelColor,
    },
    channelType: {
        fontSize: 13,
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
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

            // Filter by search query
            if (query) {
                const name = channel.displayName?.toLowerCase() || '';
                const channelName = channel.name?.toLowerCase() || '';
                return name.includes(query) || channelName.includes(query);
            }

            return true;
        });
    }, [channels, channelId, searchQuery]);

    const handleClose = useCallback(() => {
        dismissModal(componentId);
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
            // Format the forwarded message
            const forwardPrefix = intl.formatMessage({
                id: 'forward.prefix',
                defaultMessage: 'Forwarded message',
            });

            let forwardMessage = '';
            if (message) {
                // Check if message already has the forwarded prefix to avoid duplication
                const prefixPattern = new RegExp(`^_${forwardPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\s*`, 'i');
                if (prefixPattern.test(message)) {
                    // Message already has the prefix, use as-is
                    forwardMessage = message;
                } else {
                    // Add the prefix
                    forwardMessage = `_${forwardPrefix}_\n\n${message}`;
                }
            }

            // Create the forwarded post for each selected channel
            for (const targetChannelId of selectedChannelIds) {
                const post = {
                    channel_id: targetChannelId,
                    message: forwardMessage,
                    file_ids: fileIds || [],
                    root_id: '',
                    props: {
                        forwarded_from_post_id: postId,
                    },
                };

                await createPost(serverUrl, post, []);
            }

            // Close the modal
            handleClose();
        } catch (error) {
            Alert.alert(
                intl.formatMessage({id: 'forward.error', defaultMessage: 'Forward Failed'}),
                intl.formatMessage({id: 'forward.error_message', defaultMessage: 'Failed to forward the message. Please try again.'}),
            );
        } finally {
            setIsForwarding(false);
        }
    }, [selectedChannelIds, message, fileIds, postId, serverUrl, intl, handleClose]);

    const renderChannelItem = useCallback(({item: channel}: {item: ChannelModel}) => {
        const isSelected = selectedChannelIds.includes(channel.id);
        const channelType = channel.type === 'D' ? 'Direct Message' :
            channel.type === 'G' ? 'Group Message' :
                channel.type === 'P' ? 'Private Channel' : 'Public Channel';

        return (
            <Pressable
                style={[styles.channelItem, isSelected && styles.channelItemSelected]}
                onPress={() => handleSelectChannel(channel)}
            >
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && (
                        <CompassIcon
                            name='check'
                            size={16}
                            color='#fff'
                        />
                    )}
                </View>
                <View style={styles.channelIcon}>
                    <CompassIcon
                        name={channel.type === 'D' ? 'account' :
                            channel.type === 'G' ? 'account-multiple' :
                                channel.type === 'P' ? 'lock' : 'globe'}
                        size={24}
                        color={theme.centerChannelColor}
                    />
                </View>
                <View style={styles.channelInfo}>
                    <Text style={styles.channelName} numberOfLines={1}>
                        {channel.displayName || channel.name}
                    </Text>
                    <Text style={styles.channelType}>
                        {channelType}
                    </Text>
                </View>
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
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'forward.title', defaultMessage: 'Forward Message'})}
                </Text>
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
                    placeholder={intl.formatMessage({id: 'forward.search_placeholder', defaultMessage: 'Search channels'})}
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
