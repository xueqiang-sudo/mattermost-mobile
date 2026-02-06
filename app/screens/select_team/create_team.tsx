// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState} from 'react';
import {useIntl} from 'react-intl';
import {Text, TextInput, TouchableOpacity, View} from 'react-native';

import Button from '@components/button';
import FormattedText from '@components/formatted_text';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {dismissModal} from '@screens/navigation';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 40,
    },
    title: {
        color: theme.sidebarHeaderTextColor,
        textAlign: 'center',
        marginBottom: 40,
        ...typography('Heading', 600),
    },
    formContainer: {
        marginBottom: 40,
    },
    inputContainer: {
        marginBottom: 24,
    },
    inputLabel: {
        color: theme.sidebarHeaderTextColor,
        marginBottom: 8,
        ...typography('Body', 100, 'SemiBold'),
    },
    input: {
        backgroundColor: theme.centerChannelBg,
        borderColor: theme.centerChannelColor,
        borderWidth: 1,
        borderRadius: 4,
        paddingHorizontal: 16,
        paddingVertical: 12,
        color: theme.sidebarHeaderTextColor,
        ...typography('Body', 200),
    },
    buttonContainer: {
        marginTop: 40,
    },
    cancelButton: {
        marginTop: 16,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: theme.linkColor,
        ...typography('Body', 100, 'SemiBold'),
    },
}));

const CreateTeam = () => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const intl = useIntl();
    const [enterpriseName, setEnterpriseName] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCreateEnterprise = async () => {
        if (!enterpriseName.trim()) {
            // Show error for empty name
            return;
        }

        setLoading(true);
        try {
            // TODO: Implement create team API call

            // Simulate API call
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Navigate back to home or team list
            dismissModal({componentId: Screens.CREATE_TEAM});
        } catch (error) {
            // Handle error
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        dismissModal({componentId: Screens.CREATE_TEAM});
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>
                <FormattedText
                    id='create_team.title'
                    defaultMessage='Create Enterprise'
                />
            </Text>

            <View style={styles.formContainer}>
                <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>
                        <FormattedText
                            id='create_team.enterprise_name'
                            defaultMessage='Enterprise Name'
                        />
                    </Text>
                    <TextInput
                        style={styles.input}
                        value={enterpriseName}
                        onChangeText={setEnterpriseName}
                        placeholder='Enter enterprise name'
                        placeholderTextColor={theme.centerChannelColor}
                    />
                </View>
            </View>

            <View style={styles.buttonContainer}>
                <Button
                    onPress={handleCreateEnterprise}
                    text={intl.formatMessage({id: 'create_team.create', defaultMessage: 'Create'})}
                    theme={theme}
                    size='lg'
                    showLoader={loading}
                    disabled={!enterpriseName.trim() || loading}
                />

                <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancel}
                >
                    <Text style={styles.cancelButtonText}>
                        <FormattedText
                            id='create_team.cancel'
                            defaultMessage='Cancel'
                        />
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default CreateTeam;
