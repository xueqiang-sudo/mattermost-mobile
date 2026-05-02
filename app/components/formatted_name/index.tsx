// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Text, type TextProps} from 'react-native';

import {formatFullName} from '@utils/display_name';

type FormattedNameProps = Omit<TextProps, 'children'> & {

    /** 语言环境，如 zh-CN、en */
    locale: string;

    /** 姓 */
    surname: string;

    /** 名 */
    givenName: string;
};

/**
 * 根据语言环境显示姓名
 * - 中文环境：姓在前，名在后，无空格
 * - 非中文环境：名在前，姓在后，有空格
 */
const FormattedName = ({locale, surname, givenName, ...textProps}: FormattedNameProps) => {
    const name = formatFullName(locale, surname, givenName);

    return (
        <Text {...textProps}>
            {name}
        </Text>
    );
};

export default FormattedName;
