// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {TouchableHighlight} from 'react-native';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {ENABLE_INTERNAL_GROUPS} from '@constants/channel';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {findChannels} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        flex: 1,
        backgroundColor: changeOpacity(theme.sidebarText, 0.12),
        borderRadius: 8,
        padding: 8,
        marginVertical: 10,
        height: 40,
    },
    icon: {
        width: 24,
        fontSize: 24,
        color: changeOpacity(theme.sidebarText, 0.72),
    },
    input: {
        color: changeOpacity(theme.sidebarText, 0.72),
        marginLeft: 5,
        marginTop: 1,
        ...typography('Body', 200),
    },
}));

const SearchField = () => {
    const theme = useTheme();
    const intl = useIntl();
    const styles = getStyleSheet(theme);

    const onPress = usePreventDoubleTap(useCallback(() => {
        const titleId = ENABLE_INTERNAL_GROUPS ? 'find_channels.title' : 'find_channels.title_no_internal';
        findChannels(
            intl.formatMessage({id: titleId, defaultMessage: 'Search groups, chats & contacts'}),
            theme,
        );
    }, [intl, theme]));

    return (
        <TouchableHighlight
            style={styles.container}
            onPress={onPress}
            underlayColor={changeOpacity(theme.sidebarText, 0.32)}
            testID='channel_list_subheader.search_field.button'
        >
            <>
                <CompassIcon
                    name='magnify'
                    style={styles.icon}
                />
                <FormattedText
                    defaultMessage='Search conversations, channels and contacts...'
                    id='channel_list.search_placeholder'
                    style={styles.input}
                />
            </>
        </TouchableHighlight>
    );
};

export default SearchField;
