// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {Navigation, Screens} from '@constants';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {StackNavigationProp} from '@react-navigation/stack';

type WorkspaceCard = {
    key: string;
    icon: string;
    labelId: string;
    defaultLabel: string;
    screen?: string;
    wide?: boolean;
    subtitle?: string;
};

const CARDS: WorkspaceCard[] = [
    {key: 'news', icon: 'bullhorn-outline', labelId: 'workspace.card.news', defaultLabel: '公司动态', screen: Screens.WORKSPACE_NEWS},
    {key: 'hot_products', icon: 'fire', labelId: 'workspace.card.hot_products', defaultLabel: '热销品', screen: Screens.APPS_HOT_PRODUCTS},
    {key: 'inventory', icon: 'package-variant-closed', labelId: 'workspace.card.inventory', defaultLabel: 'ERP 库存', screen: Screens.APPS_INVENTORY},
    {key: 'mes', icon: 'factory', labelId: 'workspace.card.mes', defaultLabel: '排产', screen: Screens.APPS_MES},
    {key: 'orders', icon: 'clipboard-text-outline', labelId: 'workspace.card.orders', defaultLabel: '我的订单', screen: Screens.WORKSPACE_ORDERS, wide: true, subtitle: '普通订单 / 打样订单'},
    {key: 'messages', icon: 'message-text-outline', labelId: 'workspace.card.messages', defaultLabel: '消息'},
    {key: 'approvals', icon: 'check-decagram-outline', labelId: 'workspace.card.approvals', defaultLabel: '审批', screen: Screens.APPS_APPROVALS},
    {key: 'todos', icon: 'format-list-checks', labelId: 'workspace.card.todos', defaultLabel: '待办', screen: Screens.WORKSPACE_TODOS},
    {key: 'notebook', icon: 'notebook-outline', labelId: 'workspace.card.notebook', defaultLabel: '智能笔记'},
];

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    scrollContent: {
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    headerTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 600, 'SemiBold'),
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    card: {
        width: '48%',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 100,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardWide: {
        width: '100%',
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
    },
    cardIcon: {
        marginBottom: 8,
    },
    cardLabel: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
        textAlign: 'center',
    },
    cardSubtitle: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'Regular'),
        textAlign: 'center',
        marginTop: 4,
    },
}));

type Props = {
    navigation: StackNavigationProp<any>;
    theme: Theme;
};

const WorkspaceScreen = ({navigation, theme}: Props) => {
    const intl = useIntl();
    const styles = getStyles(theme);

    const handleCardPress = useCallback((card: WorkspaceCard) => {
        if (card.screen) {
            navigation.navigate(card.screen);
        } else if (card.key === 'messages') {
            // Switch to Messages tab
            DeviceEventEmitter.emit(Navigation.NAVIGATE_TO_TAB, {screen: Screens.HOME_TAB_CHAT});
        }
        // 公司动态、我的订单、待办 - 后续实现
    }, [navigation]);

    const renderCard = (card: WorkspaceCard) => {
        const label = intl.formatMessage({id: card.labelId, defaultMessage: card.defaultLabel});

        return (
            <TouchableOpacity
                key={card.key}
                style={[styles.card, card.wide && styles.cardWide]}
                onPress={() => handleCardPress(card)}
                activeOpacity={0.7}
                testID={`workspace.card.${card.key}`}
            >
                <CompassIcon
                    name={card.icon}
                    size={32}
                    color={theme.buttonBg}
                    style={styles.cardIcon}
                />
                <View>
                    <Text style={styles.cardLabel}>{label}</Text>
                    {card.subtitle ? (
                        <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
                    ) : null}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView
            style={styles.container}
            edges={['top']}
            testID='workspace.screen'
        >
            <View style={styles.header}>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'workspace.title', defaultMessage: '工作台'})}
                </Text>
            </View>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.grid}>
                    {CARDS.map(renderCard)}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default WorkspaceScreen;
