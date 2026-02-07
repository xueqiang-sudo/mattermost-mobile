// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {showModal} from '@screens/navigation';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';

const getStyleSheet = makeStyleSheetFromTheme(() => ({
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 80,
        paddingBottom: 40,
        backgroundColor: '#F5F5F5',
    },
    title: {
        color: '#2E7D32',
        textAlign: 'center',
        marginBottom: 12,
        ...typography('Heading', 600),
    },
    description: {
        color: '#666666',
        textAlign: 'center',
        marginBottom: 40,
        ...typography('Body', 100),
    },
    cardContainer: {
        marginBottom: 20,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E0E0E0',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    cardButton: {
        padding: 32,
        alignItems: 'center',
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    joinIconContainer: {
        backgroundColor: '#FF9800',
    },
    createIconContainer: {
        backgroundColor: '#2196F3',
    },
    cardTitle: {
        color: '#333333',
        marginBottom: 8,
        ...typography('Body', 200, 'SemiBold'),
    },
    cardAction: {
        color: '#2196F3',
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
        showModal(Screens.JOIN_TEAM_QR, 'Join Enterprise', {
            serverUrl,
            nickname: currentUser?.nickname || '',
            userId: currentUser?.id || '',
        }, {
            topBar: {visible: false},
        });
    };

    const handleCreateEnterprise = () => {
        showModal(Screens.CREATE_TEAM, 'Create Enterprise', {
            serverUrl,
            nickname: currentUser?.nickname || '',
            userId: currentUser?.id || '',
        }, {
            topBar: {visible: false},
        });
    };

    return (
        <View style={styles.container}>
            <FormattedText
                style={styles.title}
                id='enterprise_selection.title'
                defaultMessage='Enterprise Services'
            />
            <FormattedText
                style={styles.description}
                id='enterprise_selection.description'
                defaultMessage='Please select an option below to start using enterprise features'
            />

            <TouchableOpacity
                style={styles.cardContainer}
                onPress={handleJoinEnterprise}
            >
                <View style={styles.cardButton}>
                    <View style={[styles.iconContainer, styles.joinIconContainer]}>
                        <CompassIcon
                            name='plus'
                            size={32}
                            color='#FFFFFF'
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
                            color='#FFFFFF'
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
