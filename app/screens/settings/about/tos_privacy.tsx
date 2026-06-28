// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const CARD_RADIUS = 12;
const CARD_PADDING = 16;

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    const borderSubtle = changeOpacity(theme.centerChannelColor, 0.1);
    return {
        card: {
            borderRadius: CARD_RADIUS,
            borderWidth: 1,
            borderColor: borderSubtle,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
            padding: CARD_PADDING,
            marginBottom: 24,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            minHeight: 44,
        },
        rowIconWrap: {
            width: 28,
            marginRight: 12,
            alignItems: 'center',
            justifyContent: 'center',
        },
        rowLabel: {
            ...typography('Body', 200, 'Regular'),
            color: theme.linkColor,
            flex: 1,
        },
        divider: {
            height: 1,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
            marginLeft: 40,
        },
    };
});

type TosPrivacyContainerProps = {
    onPressTermsOfService: () => void;
    onPressPrivacyPolicy: () => void;
};

const TosPrivacyContainer = ({
    onPressTermsOfService,
    onPressPrivacyPolicy,
}: TosPrivacyContainerProps) => {
    const theme = useTheme();
    const style = getStyleSheet(theme);

    return (
        <View style={style.card}>
            <TouchableOpacity
                accessibilityRole='link'
                activeOpacity={0.72}
                onPress={onPressTermsOfService}
                style={style.row}
                testID='about.terms_of_service.row'
            >
                <View style={style.rowIconWrap}>
                    <CompassIcon
                        color={theme.linkColor}
                        name='link-variant'
                        size={20}
                    />
                </View>
                <FormattedText
                    defaultMessage='User Agreement'
                    id='mobile.tos_link'
                    style={style.rowLabel}
                    testID='about.terms_of_service'
                />
            </TouchableOpacity>
            <View style={style.divider}/>
            <TouchableOpacity
                accessibilityRole='link'
                activeOpacity={0.72}
                onPress={onPressPrivacyPolicy}
                style={style.row}
                testID='about.privacy_policy.row'
            >
                <View style={style.rowIconWrap}>
                    <CompassIcon
                        color={theme.linkColor}
                        name='link-variant'
                        size={20}
                    />
                </View>
                <FormattedText
                    defaultMessage='Privacy Policy'
                    id='mobile.privacy_link'
                    style={style.rowLabel}
                    testID='about.privacy_policy'
                />
            </TouchableOpacity>
        </View>
    );
};

export default TosPrivacyContainer;
