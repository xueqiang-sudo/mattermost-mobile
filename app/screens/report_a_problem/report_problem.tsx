// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {View, Text, ScrollView} from 'react-native';

import MenuDivider from '@components/menu_divider';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {popTopScreen} from '@screens/navigation';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import AppLogs from './app_logs';
import CopyMetadata from './copy_metadata';
import {getCommonStyleSheet} from './styles';

import type {AvailableScreens} from '@typings/screens/navigation';
import type {ReportAProblemMetadata} from '@typings/screens/report_a_problem';
export const REPORT_PROBLEM_CLOSE_BUTTON_ID = 'close-report-problem';

type Props = {
    componentId: AvailableScreens;
    reportAProblemMail?: string;
    reportAProblemLink?: string;
    siteName?: string;
    allowDownloadLogs: boolean;
    reportAProblemType?: string;
    isLicensed: boolean;
    metadata: ReportAProblemMetadata;
}

const getStyleSheet = makeStyleSheetFromTheme((theme) => ({
    ...getCommonStyleSheet(theme),
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
        paddingVertical: 20,
        gap: 20,
    },
    body: {
        flex: 1,
    },
    content: {
        gap: 16,
        paddingHorizontal: 20,
    },
    detailsTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    detailsSection: {
        gap: 8,
    },
}));

const ReportProblem = (props: Props) => {
    const {componentId, allowDownloadLogs, metadata} = props;
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const intl = useIntl();

    const close = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);
    useAndroidHardwareBackHandler(componentId, close);

    const descriptionText = allowDownloadLogs ? intl.formatMessage({
        id: 'screen.report_problem.details.description',
        defaultMessage: 'When reporting a problem, share the metadata and app logs given below to help troubleshoot your problem faster',
    }) : intl.formatMessage({
        id: 'screen.report_problem.details.description_without_logs',
        defaultMessage: 'When reporting a problem, share the metadata given below to help troubleshoot your problem faster',
    });

    return (
        <View style={styles.container}>
            <View style={styles.body}>
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.detailsSection}>
                        <Text style={styles.detailsTitle}>
                            {intl.formatMessage({
                                id: 'screen.report_problem.details.title',
                                defaultMessage: 'Troubleshooting details',
                            })}
                        </Text>
                        <Text style={styles.bodyText}>
                            {descriptionText}
                        </Text>
                    </View>
                    <MenuDivider/>
                    <CopyMetadata
                        metadata={metadata}
                        componentId={componentId}
                    />
                    {allowDownloadLogs && (
                        <>
                            <MenuDivider/>
                            <AppLogs/>
                        </>
                    )}
                </ScrollView>
            </View>
        </View>
    );
};

export default ReportProblem;
