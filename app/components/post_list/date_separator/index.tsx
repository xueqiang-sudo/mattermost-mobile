// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {type StyleProp, type TextStyle, View, type ViewStyle} from 'react-native';

import FormattedDate, {type FormattedDateFormat} from '@components/formatted_date';
import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {isSameYear, isToday, isYesterday} from '@utils/datetime';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type DateSeparatorProps = {
    date: number | Date;
    style?: StyleProp<Intersection<TextStyle, ViewStyle>>;
    timezone?: string | null;

    /** WeChat/WeCom style: centered text only, no lines, smaller grey */
    compact?: boolean;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            alignItems: 'center',
            flexDirection: 'row',
            marginVertical: 8,
        },
        containerCompact: {
            alignSelf: 'center',
            marginVertical: 6,
        },
        line: {
            flex: 1,
            height: 1,
            backgroundColor: theme.centerChannelColor,
            opacity: 0.1,
        },
        date: {
            color: theme.centerChannelColor,
            marginHorizontal: 12,
            ...typography('Body', 75, 'SemiBold'),
        },
        dateCompact: {
            color: changeOpacity(theme.centerChannelColor, 0.5),
            fontSize: 12,
            ...typography('Body', 75, 'Regular'),
        },
    };
});

const DATE_FORMATS = {
    withinYear: {month: 'short', day: 'numeric'},
    afterYear: {dateStyle: 'medium'},
} satisfies Record<string, FormattedDateFormat>;

const RecentDate = (props: DateSeparatorProps) => {
    const {date, ...otherProps} = props;
    const when = new Date(date);

    if (isToday(when)) {
        return (
            <FormattedText
                {...otherProps}
                id='date_separator.today'
                defaultMessage='Today'
            />
        );
    } else if (isYesterday(when)) {
        return (
            <FormattedText
                {...otherProps}
                id='date_separator.yesterday'
                defaultMessage='Yesterday'
            />
        );
    }

    const format: FormattedDateFormat = isSameYear(when, new Date()) ? DATE_FORMATS.withinYear : DATE_FORMATS.afterYear;

    return (
        <FormattedDate
            {...otherProps}
            format={format}
            value={date}
        />
    );
};

const DateSeparator = (props: DateSeparatorProps) => {
    const {compact, ...rest} = props;
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    if (compact) {
        return (
            <View style={[styles.containerCompact, props.style as StyleProp<ViewStyle>]}>
                <RecentDate
                    {...rest}
                    style={styles.dateCompact}
                />
            </View>
        );
    }

    return (
        <View style={[styles.container, props.style as StyleProp<ViewStyle>]}>
            <View style={styles.line}/>
            <RecentDate
                {...rest}
                style={styles.date}
            />
            <View style={styles.line}/>
        </View>
    );
};

export default React.memo(DateSeparator);
