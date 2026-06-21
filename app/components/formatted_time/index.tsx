// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Text, type TextProps} from 'react-native';

import {getFormattedTime} from '@utils/time';

type FormattedTimeProps = TextProps & {
    isMilitaryTime: boolean;
    timezone: UserTimezone | string;
    value: number | string | Date;
}

const FormattedTime = ({isMilitaryTime, timezone, value, ...props}: FormattedTimeProps) => {
    const {locale} = useIntl();
    const formattedTime = getFormattedTime(isMilitaryTime, timezone, value, locale);

    return (
        <Text {...props}>
            {formattedTime}
        </Text>
    );
};

export default FormattedTime;
