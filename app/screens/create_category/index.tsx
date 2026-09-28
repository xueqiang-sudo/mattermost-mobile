// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {createCategory} from '@actions/remote/category';
import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissModal} from '@screens/navigation';
import {getFullErrorMessage} from '@utils/errors';
import {logDebug} from '@utils/log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

const MAX_LENGTH = 22;

type Props = {
    componentId: AvailableScreens;
    teamId: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: theme.sidebarBg,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
        marginRight: 40,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 24,
    },
    helpText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75),
        marginBottom: 16,
    },
    inputLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75),
        marginBottom: 6,
    },
    input: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 4,
        color: theme.centerChannelColor,
        paddingHorizontal: 12,
        paddingVertical: 10,
        ...typography('Body', 100),
    },
    charCount: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        ...typography('Body', 50),
        marginTop: 4,
        textAlign: 'right',
    },
    errorText: {
        color: theme.errorTextColor,
        ...typography('Body', 75),
        marginTop: 8,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 20,
        paddingVertical: 16,
        gap: 12,
    },
    cancelButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 4,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    createButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 4,
        backgroundColor: theme.buttonBg,
    },
    createButtonDisabled: {
        opacity: 0.5,
    },
    cancelText: {
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },
    createText: {
        color: theme.buttonColor,
        ...typography('Body', 100, 'SemiBold'),
    },
}));

export default function CreateCategory({componentId, teamId}: Props) {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const insets = useSafeAreaInsets();
    const [categoryName, setCategoryName] = useState('');
    const [error, setError] = useState('');
    const [creating, setCreating] = useState(false);
    const style = getStyleSheet(theme);

    const handleChange = useCallback((text: string) => {
        if (text.length <= MAX_LENGTH) {
            setCategoryName(text);
            setError('');
        }
    }, []);

    const handleCancel = useCallback(async () => {
        await dismissModal({componentId});
    }, [componentId]);

    const handleCreate = usePreventDoubleTap(useCallback(async () => {
        const name = categoryName.trim();
        if (!name) {
            setError(intl.formatMessage({
                id: 'create_category.error.empty',
                defaultMessage: 'Please enter a category name',
            }));
            return;
        }

        Keyboard.dismiss();
        setCreating(true);

        const {error: err} = await createCategory(serverUrl, teamId, name);
        if (err) {
            logDebug('createCategory error', getFullErrorMessage(err));
            Alert.alert(
                intl.formatMessage({id: 'create_category.error.title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'create_category.error.message', defaultMessage: 'Failed to create category. Please try again.'}),
            );
            setCreating(false);
            return;
        }

        await dismissModal({componentId});
    }, [categoryName, componentId, intl, serverUrl, teamId]));

    const isDisabled = !categoryName.trim() || creating;

    return (
        <View style={style.container} testID='create_category.screen'>
            <View style={[style.header, {paddingTop: insets.top}]}>
                <TouchableOpacity
                    style={style.backButton}
                    onPress={handleCancel}
                    testID='create_category.back.button'
                >
                    <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'create_category_modal.title', defaultMessage: 'Create Category'})}
                </Text>
            </View>
            <View style={style.content}>
                <Text style={style.helpText}>
                    {intl.formatMessage({
                        id: 'edit_category_modal.helpText',
                        defaultMessage: 'After creating, you can move channels into this category from the channel long-press menu.',
                    })}
                </Text>
                <Text style={style.inputLabel}>
                    {intl.formatMessage({
                        id: 'edit_category_modal.name',
                        defaultMessage: 'Category name',
                    })}
                </Text>
                <TextInput
                    autoFocus={true}
                    maxLength={MAX_LENGTH}
                    onChangeText={handleChange}
                    placeholder={intl.formatMessage({
                        id: 'edit_category_modal.placeholder',
                        defaultMessage: 'Enter category name',
                    })}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.32)}
                    returnKeyType='done'
                    onSubmitEditing={handleCreate}
                    style={style.input}
                    testID='create_category.input'
                    value={categoryName}
                />
                <Text style={style.charCount}>{`${categoryName.length}/${MAX_LENGTH}`}</Text>
                {Boolean(error) && <Text style={style.errorText}>{error}</Text>}
            </View>
            <View style={style.actions}>
                <TouchableOpacity
                    onPress={handleCancel}
                    style={style.cancelButton}
                    testID='create_category.cancel.button'
                >
                    <Text style={style.cancelText}>
                        {intl.formatMessage({id: 'mobile.post.cancel', defaultMessage: 'Cancel'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    disabled={isDisabled}
                    onPress={handleCreate}
                    style={[style.createButton, isDisabled && style.createButtonDisabled]}
                    testID='create_category.create.button'
                >
                    <Text style={style.createText}>
                        {intl.formatMessage({
                            id: 'create_category_modal.create',
                            defaultMessage: 'Create',
                        })}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
