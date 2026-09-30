// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        backgroundColor: '#FFFFFF',
        marginBottom: 8,
        borderRadius: 8,
        overflow: 'hidden',
        marginHorizontal: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FAFAFA',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E0E0E0',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    chevron: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    title: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginLeft: 8,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    badge: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        minWidth: 20,
        alignItems: 'center',
    },
    badgeText: {
        ...typography('Body', 50, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    trashIcon: {
        marginLeft: 12,
        padding: 4,
    },
    trashIconDisabled: {
        opacity: 0.3,
    },
    content: {
        overflow: 'hidden',
    },
}));

type Props = {
    title: string;
    count: number;
    children: React.ReactNode;
    defaultCollapsed?: boolean;
    showTrash?: boolean;
    canDelete?: boolean;
    onDelete?: () => void;
};

const CollapsibleGroup = ({
    title,
    count,
    children,
    defaultCollapsed = false,
    showTrash = false,
    canDelete = false,
    onDelete,
}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const animatedHeight = useSharedValue(defaultCollapsed ? 0 : 2000);

    const toggle = () => {
        const newCollapsed = !collapsed;
        setCollapsed(newCollapsed);
        animatedHeight.value = withTiming(newCollapsed ? 0 : 2000, {duration: 300});
    };

    const handleDelete = () => {
        if (canDelete && onDelete) {
            Alert.alert(
                '删除分类',
                `确定要删除"${title}"分类吗？`,
                [
                    {text: '取消', style: 'cancel'},
                    {text: '删除', style: 'destructive', onPress: onDelete},
                ],
            );
        }
    };

    const animatedStyle = useAnimatedStyle(() => ({
        height: animatedHeight.value,
        opacity: animatedHeight.value > 0 ? 1 : 0,
    }));

    return (
        <View style={styles.container}>
            <TouchableOpacity style={styles.header} onPress={toggle}>
                <View style={styles.headerLeft}>
                    <CompassIcon
                        name={collapsed ? 'chevron-right' : 'chevron-down'}
                        size={16}
                        style={styles.chevron}
                    />
                    <Text style={styles.title}>{title}</Text>
                </View>
                <View style={styles.headerRight}>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{count}</Text>
                    </View>
                    {showTrash && (
                        <TouchableOpacity
                            onPress={handleDelete}
                            disabled={!canDelete}
                            style={[styles.trashIcon, !canDelete && styles.trashIconDisabled]}
                        >
                            <CompassIcon
                                name='delete-outline'
                                size={18}
                                color={canDelete ? theme.errorTextColor : changeOpacity(theme.centerChannelColor, 0.3)}
                            />
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
            <Animated.View style={[styles.content, animatedStyle] as any}>
                {children}
            </Animated.View>
        </View>
    );
};

export default CollapsibleGroup;
