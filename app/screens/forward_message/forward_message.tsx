// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Alert, Pressable, SectionList, StyleSheet, Text, TextInput, View} from 'react-native';
import Animated, {useAnimatedStyle, withTiming} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIntl} from 'react-intl';

import {createPost} from '@actions/remote/post';
import ChannelIcon from '@components/channel_icon';
import CompassIcon from '@components/compass_icon';
import Toast from '@components/toast';
import {General} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {dismissModal} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import NetworkManager from '@managers/network_manager';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {getUserIdFromChannelName} from '@utils/user';

import type {AvailableScreens} from '@typings/screens/navigation';
import type ChannelModel from '@typings/database/models/servers/channel';
import type TeamModel from '@typings/database/models/servers/team';
import type UserModel from '@typings/database/models/servers/user';

type ForwardMessageProps = {
    componentId: AvailableScreens;
    postId: string;
    channelId: string;
    message: string;
    fileIds?: string[];
    channels?: ChannelModel[];
    currentChannelId?: string;
    currentUserId?: string;
    currentUser?: UserModel | null;
    team?: TeamModel | null;
};

type ChannelSection = {
    key: string;
    title: string;
    data: ChannelModel[];
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
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginLeft: 8,
    },
    sectionCount: {
        fontSize: 12,
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginLeft: 4,
    },
    channelItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    channelItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    checkboxUnchecked: {
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
    },
    iconContainer: {
        marginRight: 12,
    },
    channelName: {
        flex: 1,
        fontSize: 16,
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
    currentUserId,
    currentUser,
    team,
}: ForwardMessageProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isForwarding, setIsForwarding] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [showToast, setShowToast] = useState<boolean | undefined>();
    const mounted = useRef(false);

    React.useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const toastAnimatedStyle = useAnimatedStyle(() => ({
        position: 'absolute',
        bottom: 80,
        opacity: withTiming(showToast ? 1 : 0, {duration: 300}),
    }));

    // Get display name for a channel based on type
    const getChannelDisplayName = useCallback((channel: ChannelModel): string => {
        const channelType = channel.type;

        // Public channel (O): show team name
        if (channelType === General.OPEN_CHANNEL) {
            return team?.displayName || channel.displayName || channel.name;
        }

        // Private channel (P): show channel display name
        if (channelType === General.PRIVATE_CHANNEL) {
            return channel.displayName || channel.name;
        }

        // DM (D): show other user's name, or "you" if self
        if (channelType === General.DM_CHANNEL && currentUserId) {
            const otherUserId = getUserIdFromChannelName(currentUserId, channel.name);
            if (otherUserId === currentUserId) {
                return `${currentUser?.displayName || currentUser?.username || 'You'} (you)`;
            }
            return channel.displayName || channel.name;
        }

        // GM (G): show member names excluding self
        if (channelType === General.GM_CHANNEL && currentUser) {
            const displayName = channel.displayName || '';
            const members = displayName.split(',').map((m) => m.trim()).filter(Boolean);

            // Get current user's possible names to filter out
            const userNames = new Set<string>();
            if (currentUser.displayName) userNames.add(currentUser.displayName.toLowerCase());
            if (currentUser.username) userNames.add(currentUser.username.toLowerCase());
            if (currentUser.firstName) userNames.add(currentUser.firstName.toLowerCase());
            if (currentUser.nickname) userNames.add(currentUser.nickname.toLowerCase());

            const filtered = members.filter((m) => !userNames.has(m.toLowerCase()));
            if (filtered.length > 0) {
                return filtered.join(', ');
            }
        }

        return channel.displayName || channel.name;
    }, [team, currentUser, currentUserId]);

    // Filter and group channels into sections
    const sections = useMemo<ChannelSection[]>(() => {
        if (!channels || channels.length === 0) {
            return [];
        }

        const query = searchQuery.toLowerCase().trim();
        const internal: ChannelModel[] = [];
        const external: ChannelModel[] = [];

        for (const channel of channels) {
            // Exclude the source channel
            if (channel.id === channelId) {
                continue;
            }

            // Filter by search query
            if (query) {
                const displayName = getChannelDisplayName(channel).toLowerCase();
                const channelName = channel.name?.toLowerCase() || '';
                if (!displayName.includes(query) && !channelName.includes(query)) {
                    continue;
                }
            }

            // Classify as internal or external
            // Public channels are always internal
            if (channel.type === General.OPEN_CHANNEL) {
                internal.push(channel);
                continue;
            }

            // DM: internal if other user is in team or is self
            if (channel.type === General.DM_CHANNEL && currentUserId) {
                const otherUserId = getUserIdFromChannelName(currentUserId, channel.name);
                if (!otherUserId || otherUserId === currentUserId) {
                    internal.push(channel);
                } else {
                    // For now, treat all DMs as internal (simplified)
                    internal.push(channel);
                }
                continue;
            }

            // GM/Private: check if all members are in team
            // For now, treat all as internal (simplified)
            internal.push(channel);
        }

        const result: ChannelSection[] = [];

        if (internal.length > 0) {
            result.push({
                key: 'internal',
                title: intl.formatMessage({id: 'forward.section.internal', defaultMessage: '内部群'}),
                data: internal,
            });
        }

        if (external.length > 0) {
            result.push({
                key: 'external',
                title: intl.formatMessage({id: 'forward.section.external', defaultMessage: '外部群'}),
                data: external,
            });
        }

        return result;
    }, [channels, channelId, searchQuery, currentUserId, getChannelDisplayName, intl]);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const handleSelectChannel = useCallback((channel: ChannelModel) => {
        setSelectedChannelIds((prev) => {
            if (prev.includes(channel.id)) {
                return prev.filter((id) => id !== channel.id);
            } else {
                return [...prev, channel.id];
            }
        });
    }, []);

    const handleToggleSection = useCallback((sectionKey: string) => {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionKey)) {
                next.delete(sectionKey);
            } else {
                next.add(sectionKey);
            }
            return next;
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
                if (!inlineMatch[1].startsWith('pending_')) {
                    inlineFileIds.push(inlineMatch[1]);
                }
            }

            const traditionalFileIds = (fileIds || []).filter(
                (id) => !inlineFileIds.includes(id),
            );

            const allOriginalFileIds = [...inlineFileIds, ...traditionalFileIds];

            debugLog('[Forward] File IDs:', {
                inlineFileIds,
                traditionalFileIds,
                allOriginalFileIds,
            });

            // Step 2: Copy files on server
            const oldToNewIdMap: Record<string, string> = {};

            if (allOriginalFileIds.length > 0) {
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    debugLog('[Forward] Copying files:', allOriginalFileIds);
                    const copyResult = await client.copyFiles(allOriginalFileIds);
                    debugLog('[Forward] Copy result:', copyResult);
                    const newIds = copyResult.file_ids;

                    allOriginalFileIds.forEach((oldId, index) => {
                        const newId = newIds[index];
                        if (newId) {
                            oldToNewIdMap[oldId] = newId;
                        }
                    });
                    debugLog('[Forward] File ID mapping:', oldToNewIdMap);
                } catch (copyError: any) {
                    debugLog('[Forward] File copy failed:', copyError?.message || String(copyError));
                    throw copyError;
                }
            }

            // Step 3: Rebuild message with new file IDs
            let forwardMessage = messageSource;

            forwardMessage = forwardMessage.replace(
                /!\{file:([a-z0-9_-]+)\}/g,
                (fullMatch, oldId) => {
                    const newId = oldToNewIdMap[oldId];
                    return newId ? `!{file:${newId}}` : '';
                },
            );

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

            const newFileIds = allOriginalFileIds
                .map((oldId) => oldToNewIdMap[oldId])
                .filter(Boolean);

            debugLog('[Forward] New file IDs:', newFileIds);

            // Step 4: Create the forwarded post for each selected channel
            for (const targetChannelId of selectedChannelIds) {
                const post = {
                    channel_id: targetChannelId,
                    message: forwardMessage,
                    file_ids: newFileIds,
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

            // Show success toast then close
            setShowToast(true);
            setTimeout(() => {
                if (mounted.current) {
                    setShowToast(false);
                    handleClose();
                }
            }, 1500);
        } catch (error: any) {
            debugLog('[Forward] Error:', error?.message || String(error));
            Alert.alert(
                intl.formatMessage({id: 'forward.error', defaultMessage: 'Forward Failed'}),
                error?.message || intl.formatMessage({id: 'forward.error_message', defaultMessage: 'Failed to forward the message. Please try again.'}),
            );
        } finally {
            setIsForwarding(false);
        }
    }, [selectedChannelIds, message, fileIds, postId, channelId, serverUrl, intl, handleClose, team]);

    const renderSectionHeader = useCallback(({section}: {section: ChannelSection}) => {
        const isCollapsed = collapsedSections.has(section.key);
        return (
            <Pressable
                style={styles.sectionHeader}
                onPress={() => handleToggleSection(section.key)}
            >
                <CompassIcon
                    name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                    size={20}
                    color={changeOpacity(theme.centerChannelColor, 0.56)}
                />
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionCount}>({section.data.length})</Text>
            </Pressable>
        );
    }, [collapsedSections, handleToggleSection, styles, theme]);

    const renderChannelItem = useCallback(({item: channel}: {item: ChannelModel}) => {
        const isSelected = selectedChannelIds.includes(channel.id);
        const displayName = getChannelDisplayName(channel);

        return (
            <Pressable
                style={[styles.channelItem, isSelected && styles.channelItemSelected]}
                onPress={() => handleSelectChannel(channel)}
            >
                {/* Circular checkbox */}
                <View style={[
                    styles.checkbox,
                    isSelected ? styles.checkboxChecked : styles.checkboxUnchecked,
                ]}>
                    {isSelected && (
                        <CompassIcon
                            name='check'
                            size={16}
                            color={theme.buttonColor}
                        />
                    )}
                </View>

                {/* Channel icon */}
                <View style={styles.iconContainer}>
                    <ChannelIcon
                        channelId={channel.id}
                        name={channel.name}
                        type={channel.type}
                        size={40}
                        hasDraft={false}
                        isActive={false}
                        isUnread={false}
                        isArchived={false}
                        membersCount={0}
                        shared={channel.shared}
                    />
                </View>

                {/* Channel name */}
                <Text style={styles.channelName} numberOfLines={1}>
                    {displayName}
                </Text>
            </Pressable>
        );
    }, [selectedChannelIds, handleSelectChannel, getChannelDisplayName, styles, theme]);

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

    // Filter sections based on collapsed state
    const visibleSections = useMemo(() => {
        return sections.filter((section) => !collapsedSections.has(section.key));
    }, [sections, collapsedSections]);

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
                    placeholder={intl.formatMessage({id: 'forward.search_placeholder', defaultMessage: '搜索群组...'})}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.56)}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize='none'
                    autoCorrect={false}
                />
            </View>

            <SectionList
                sections={visibleSections}
                renderItem={renderChannelItem}
                renderSectionHeader={renderSectionHeader}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={renderEmptyState}
                stickySectionHeadersEnabled={true}
            />

            {showToast !== undefined && (
                <Toast
                    animatedStyle={toastAnimatedStyle}
                    style={{backgroundColor: '#3DB887'}}
                    message={intl.formatMessage({id: 'forward.success', defaultMessage: '转发成功'})}
                    iconName='check-circle-outline'
                />
            )}
        </SafeAreaView>
    );
};

export default ForwardMessage;
