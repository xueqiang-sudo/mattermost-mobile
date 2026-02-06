// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {showModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 40,
    },
    title: {
        color: theme.sidebarHeaderTextColor,
        textAlign: 'center',
        marginBottom: 12,
        ...typography('Heading', 600),
    },
    description: {
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 40,
        ...typography('Body', 100),
    },
    cardContainer: {
        marginBottom: 20,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        overflow: 'hidden',
    },
    cardButton: {
        padding: 24,
        alignItems: 'center',
    },
    iconContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    joinIconContainer: {
        backgroundColor: changeOpacity('#4CAF50', 0.16),
    },
    createIconContainer: {
        backgroundColor: changeOpacity('#2196F3', 0.16),
    },
    cardTitle: {
        color: theme.sidebarHeaderTextColor,
        marginBottom: 8,
        ...typography('Body', 200, 'SemiBold'),
    },
    cardAction: {
        color: theme.linkColor,
        ...typography('Body', 100, 'SemiBold'),
    },
}));

interface EnterpriseSelectionProps {
    serverUrl: string;
    currentUser?: UserModel;
}

const EnterpriseSelection: React.FC<EnterpriseSelectionProps> = ({serverUrl, currentUser}) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const handleJoinEnterprise = () => {
        // Navigate to join team QR code screen
        showModal(Screens.JOIN_TEAM_QR, '加入企业', {
            serverUrl,
            nickname: currentUser?.nickname || '',
            userId: currentUser?.id || '',
        }, {
            topBar: {visible: false},
        });
    };

    const handleCreateEnterprise = () => {
        // Navigate to create team screen
        showModal(Screens.CREATE_TEAM, '创建企业');
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>
                <FormattedText
                    id='enterprise_selection.title'
                    defaultMessage='Select Enterprise Action'
                />
            </Text>
            <Text style={styles.description}>
                <FormattedText
                    id='enterprise_selection.description'
                    defaultMessage='Please select one of the following actions to start using enterprise features'
                />
            </Text>

            <TouchableOpacity
                style={styles.cardContainer}
                onPress={handleJoinEnterprise}
            >
                <View style={styles.cardButton}>
                    <View style={[styles.iconContainer, styles.joinIconContainer]}>
                        <CompassIcon
                            name='plus'
                            size={32}
                            color='#4CAF50'
                        />
                    </View>
                    <Text style={styles.cardTitle}>
                        <FormattedText
                            id='enterprise_selection.join.title'
                            defaultMessage='Enterprise is already using'
                        />
                    </Text>
                    <Text style={styles.cardAction}>
                        <FormattedText
                            id='enterprise_selection.join.action'
                            defaultMessage='Join Enterprise ›'
                        />
                    </Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.cardContainer}
                onPress={handleCreateEnterprise}
            >
                <View style={styles.cardButton}>
                    <View style={[styles.iconContainer, styles.createIconContainer]}>
                        <CompassIcon
                            name='creation-outline'
                            size={32}
                            color='#2196F3'
                        />
                    </View>
                    <Text style={styles.cardTitle}>
                        <FormattedText
                            id='enterprise_selection.create.title'
                            defaultMessage='Enterprise is not using'
                        />
                    </Text>
                    <Text style={styles.cardAction}>
                        <FormattedText
                            id='enterprise_selection.create.action'
                            defaultMessage='Create Enterprise ›'
                        />
                    </Text>
                </View>
            </TouchableOpacity>
        </View>
    );
};

export default EnterpriseSelection;
