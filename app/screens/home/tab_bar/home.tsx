// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {DeviceEventEmitter, StyleSheet, View} from 'react-native';
import JPush from 'jpush-react-native';

import JPushManager from '@init/jpush';
import Badge from '@components/badge';
import CompassIcon from '@components/compass_icon';
import {BOTTOM_TAB_ICON_SIZE} from '@constants/view';
import {subscribeAllServers} from '@database/subscription/servers';
import {subscribeUnreadAndMentionsByServer, type UnreadObserverArgs} from '@database/subscription/unreads';
import useDidUpdate from '@hooks/did_update';
import {logDebug} from '@utils/log';
import {changeOpacity, WECHAT_HOME_SECONDARY_TEXT_OPACITY} from '@utils/theme';

import type ServersModel from '@typings/database/models/app/servers';
import type {UnreadMessages, UnreadSubscription} from '@typings/database/subscriptions';

type Props = {
    isFocused: boolean;
    theme: Theme;
}

const HOME_TOTAL_MENTIONS_EVENT = 'home_total_mentions_event';

const subscriptions: Map<string, UnreadSubscription> = new Map();

const style = StyleSheet.create({
    unread: {
        left: 19,
        top: 4,
    },
    mentionsOneDigit: {
        left: 12,
    },
    mentionsTwoDigits: {
        left: 13,
    },
    mentionsThreeDigits: {
        left: 10,
    },
});

const getTotalMentionsAndUnread = () => {
    let unread = false;
    let mentions = 0;
    let unreadCount = 0;
    subscriptions.forEach((value) => {
        unread = unread || value.unread;
        mentions += value.mentions;
        unreadCount += value.unreadCount;
    });
    return {unread, mentions, unreadCount};
};

const updateBadge = () => {
    // 未登录时角标清零，不应显示未读数
    if (!JPushManager.isLoggedIn()) {
        JPush.setBadge({badge: 0, appBadge: 0});
        logDebug('Not logged in, clearing badge');
        return;
    }
    const {unreadCount} = getTotalMentionsAndUnread();
    logDebug('Setting the badge count based on unread channel count to', unreadCount);
    JPush.setBadge({badge: unreadCount, appBadge: unreadCount});
};

const unreadsSubscription = (serverUrl: string, {myChannels, settings, threadMentionCount}: UnreadObserverArgs) => {
    const unreads = subscriptions.get(serverUrl);
    if (unreads) {
        let mentions = 0;
        let unread = false;
        let unreadCount = 0;
        for (const myChannel of myChannels) {
            const isMuted = settings?.[myChannel.id]?.mark_unread === 'mention';
            mentions += isMuted ? 0 : myChannel.mentionsCount;
            if (myChannel.isUnread && !isMuted) {
                unread = true;
                unreadCount += 1;
            }
        }

        unreads.mentions = mentions + threadMentionCount;
        unreads.unread = unread;
        unreads.unreadCount = unreadCount;
        subscriptions.set(serverUrl, unreads);
        DeviceEventEmitter.emit(HOME_TOTAL_MENTIONS_EVENT);
    }
};

const serversObserver = async (servers: ServersModel[]) => {
    // unsubscribe mentions from servers that were removed
    const allUrls = new Set(servers.map((s) => s.url));
    const subscriptionsToRemove = [...subscriptions].filter(([key]) => !allUrls.has(key));
    let hasRemovedServers = false;
    for (const [key, map] of subscriptionsToRemove) {
        map.subscription?.unsubscribe();
        subscriptions.delete(key);
        hasRemovedServers = true;
    }

    for (const server of servers) {
        const {lastActiveAt, url} = server;
        if (lastActiveAt && !subscriptions.has(url)) {
            const unreads: UnreadSubscription = {
                mentions: 0,
                unread: false,
                unreadCount: 0,
            };
            subscriptions.set(url, unreads);
            unreads.subscription = subscribeUnreadAndMentionsByServer(url, unreadsSubscription);
        } else if (!lastActiveAt && subscriptions.has(url)) {
            subscriptions.get(url)?.subscription?.unsubscribe();
            subscriptions.delete(url);
            hasRemovedServers = true;
        }
    }
    if (hasRemovedServers) {
        DeviceEventEmitter.emit(HOME_TOTAL_MENTIONS_EVENT);
    }
};

const Home = ({isFocused, theme}: Props) => {
    const [total, setTotal] = useState<UnreadMessages>({mentions: 0, unread: false, unreadCount: 0});

    useEffect(() => {
        const totalMentionsEventListener = () => {
            setTotal((prev) => {
                const newTotal = getTotalMentionsAndUnread();
                if (prev.mentions === newTotal.mentions && prev.unread === newTotal.unread && prev.unreadCount === newTotal.unreadCount) {
                    return prev;
                }
                return newTotal;
            });
        };
        const totalSubscription = DeviceEventEmitter.addListener(HOME_TOTAL_MENTIONS_EVENT, totalMentionsEventListener);

        const subscription = subscribeAllServers(serversObserver);

        return () => {
            totalSubscription.remove();

            subscription?.unsubscribe();
            subscriptions.forEach((unreads) => {
                unreads.subscription?.unsubscribe();
            });
            subscriptions.clear();
        };
    }, []);

    useDidUpdate(() => {
        updateBadge();
    }, [total]);

    let unreadStyle;
    if (total.mentions) {
        unreadStyle = style.mentionsOneDigit;
        if (total.mentions > 9) {
            unreadStyle = style.mentionsTwoDigits;
        } else if (total.mentions > 99) {
            unreadStyle = style.mentionsThreeDigits;
        }
    } else if (total.unread) {
        unreadStyle = style.unread;
    }

    return (
        <View>
            <CompassIcon
                size={BOTTOM_TAB_ICON_SIZE}
                name='message-text-outline'
                color={isFocused ? theme.buttonBg : changeOpacity(theme.centerChannelColor, WECHAT_HOME_SECONDARY_TEXT_OPACITY)}
            />
            <Badge
                backgroundColor={theme.errorTextColor}
                borderColor={theme.sidebarTeamBarBg}
                color={theme.buttonColor}
                style={unreadStyle}
                visible={!isFocused && Boolean(unreadStyle)}
                type='Small'
                value={total.mentions || (total.unread ? -1 : 0)}
            />
        </View>
    );
};

export default Home;
