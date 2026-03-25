// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type UserModel from '@typings/database/models/servers/user';
import type {StyleProp, ViewStyle} from 'react-native';

const MAX_AVATARS = 9;
const GRID_COLS = 3;

type SlotLayout = {
    left: number;
    top: number;
    width: number;
    height: number;
};

/**
 * 与微信会话列表群头像一致：
 * - 1 人：整格
 * - 2 人：左右各半、竖向拉满
 * - 3 人：上排两个、下排一个水平居中
 * - 4 人：2×2
 * - 5+：3 列网格（与原逻辑一致）
 */
function getSlotLayout(index: number, count: number, size: number, gap: number): SlotLayout {
    const pad = gap / 2;

    if (count === 1) {
        return {
            left: pad,
            top: pad,
            width: size - gap,
            height: size - gap,
        };
    }

    if (count === 2) {
        const colW = (size - gap * 2) / 2;
        const h = size - gap;
        if (index === 0) {
            return {left: pad, top: pad, width: colW, height: h};
        }
        return {left: pad + colW + gap, top: pad, width: colW, height: h};
    }

    if (count === 3) {
        const rowH = (size - gap * 2) / 2;
        const cellW = (size - gap * 2) / 2;
        if (index === 0) {
            return {left: pad, top: pad, width: cellW, height: rowH};
        }
        if (index === 1) {
            return {left: pad + cellW + gap, top: pad, width: cellW, height: rowH};
        }
        const bottomTop = pad + rowH + gap;
        const bottomLeft = (size - cellW) / 2;
        return {left: bottomLeft, top: bottomTop, width: cellW, height: rowH};
    }

    const gridCols = count <= 4 ? 2 : GRID_COLS;
    const cellSize = size / gridCols;
    const row = Math.floor(index / gridCols);
    const col = index % gridCols;
    const avatarSize = Math.max(4, cellSize - gap);
    return {
        left: col * cellSize + gap / 2,
        top: row * cellSize + gap / 2,
        width: avatarSize,
        height: avatarSize,
    };
}

type Props = {
    users: UserModel[];
    expectedCount?: number;
    size: number;
    isOnCenterBg?: boolean;
    isUnread?: boolean;
    isMuted?: boolean;
    style?: StyleProp<ViewStyle>;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.sidebarText, 0.12),
    },
    containerOnCenterBg: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.12),
    },
    containerUnread: {
        backgroundColor: changeOpacity(theme.sidebarUnreadText, 0.2),
    },
    containerUnreadOnCenterBg: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.2),
    },
    avatar: {
        backgroundColor: changeOpacity(theme.sidebarText, 0.24),
    },
    avatarOnCenterBg: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.24),
    },
    placeholder: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.sidebarText, 0.2),
    },
    placeholderIcon: {
        color: changeOpacity(theme.sidebarText, 0.5),
    },
}));

const GmAvatarGrid = ({users, expectedCount = users.length, size, isOnCenterBg, isUnread, isMuted, style}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const boundedExpectedCount = Math.max(0, Math.min(MAX_AVATARS, expectedCount));
    const displayUsers = users.slice(0, MAX_AVATARS);
    const renderCount = Math.max(displayUsers.length, boundedExpectedCount);
    const gap = 1;

    const containerStyle = [
        styles.container,
        isOnCenterBg && styles.containerOnCenterBg,
        isUnread && !isMuted && (isOnCenterBg ? styles.containerUnreadOnCenterBg : styles.containerUnread),
    ];

    if (displayUsers.length === 0) {
        return (
            <View style={[containerStyle, styles.placeholder, style, {width: size, height: size}]}>
                <CompassIcon
                    name='account-group-outline'
                    size={size * 0.5}
                    style={[styles.placeholderIcon, {left: 0}]}
                />
            </View>
        );
    }

    return (
        <View style={[containerStyle, style, {width: size, height: size}]}>
            {Array.from({length: renderCount}, (_, index) => {
                const user = displayUsers[index];
                const {left, top, width, height} = getSlotLayout(index, renderCount, size, gap);
                const minSide = Math.min(width, height);
                const borderRadius = Math.max(2, minSide * 0.1);
                const pictureSize = minSide;

                return (
                    <View
                        key={user ? user.id : `placeholder-${index}`}
                        style={{
                            position: 'absolute',
                            left,
                            top,
                            width,
                            height,
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                        }}
                    >
                        {user ? (
                            <ProfilePicture
                                author={user}
                                size={pictureSize}
                                showStatus={false}
                                borderRadius={borderRadius}
                            />
                        ) : (
                            <View style={[styles.placeholder, {width: pictureSize, height: pictureSize, borderRadius}]}>
                                <CompassIcon
                                    name='account-outline'
                                    size={Math.max(8, pictureSize * 0.5)}
                                    style={[styles.placeholderIcon, {left: 0}]}
                                />
                            </View>
                        )}
                    </View>
                );
            })}
        </View>
    );
};

export default React.memo(GmAvatarGrid);
