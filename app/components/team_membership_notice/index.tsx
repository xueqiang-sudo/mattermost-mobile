// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, Modal, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import Button from '@components/button';
import {Events} from '@constants';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    backdrop: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: changeOpacity('#000000', 0.55),
        paddingHorizontal: 24,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 12,
        padding: 20,
        backgroundColor: theme.centerChannelBg,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    title: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 12,
    },
    description: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.88),
        marginBottom: 20,
        lineHeight: 22,
    },
}));

/**
 * 离开团队时的主题化提示（替代系统 Alert，避免浅色弹窗与暗色界面不一致）。
 * 文案为中性表述，适用于主动退出/解散团队与被管理员移除。
 */
const TeamMembershipNotice = () => {
    const theme = useTheme();
    const intl = useIntl();
    const insets = useSafeAreaInsets();
    const styles = getStyleSheet(theme);
    const [visible, setVisible] = useState(false);
    const [displayName, setDisplayName] = useState('');

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.LEAVE_TEAM, (payload: string | {displayName?: string}) => {
            const name = typeof payload === 'string' ? payload : payload?.displayName;
            if (typeof name === 'string' && name.length > 0) {
                setDisplayName(name);
                setVisible(true);
            }
        });
        return () => listener.remove();
    }, []);

    const onClose = useCallback(() => {
        setVisible(false);
    }, []);

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType='fade'
            onRequestClose={onClose}
            statusBarTranslucent={true}
        >
            <View
                style={[styles.backdrop, {paddingBottom: insets.bottom + 8}]}
                testID='team_membership_notice.backdrop'
            >
                <View
                    style={styles.card}
                    testID='team_membership_notice.card'
                >
                    <Text style={styles.title}>
                        {intl.formatMessage({
                            id: 'alert.removed_from_team.title',
                            defaultMessage: 'Team membership updated',
                        })}
                    </Text>
                    <Text style={styles.description}>
                        {intl.formatMessage(
                            {
                                id: 'alert.removed_from_team.description',
                                defaultMessage: 'You are no longer a member of team {displayName}.',
                            },
                            {displayName},
                        )}
                    </Text>
                    <Button
                        theme={theme}
                        text={intl.formatMessage({id: 'mobile.oauth.something_wrong.okButton', defaultMessage: 'OK'})}
                        onPress={onClose}
                        testID='team_membership_notice.ok'
                    />
                </View>
            </View>
        </Modal>
    );
};

export default TeamMembershipNotice;
