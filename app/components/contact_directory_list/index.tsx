// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {useTheme} from '@context/theme';
import {getContactListDisplayName} from '@utils/contact_section';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {MMDepartment} from '@client/rest/team_department';

export type ContactDirectoryListProps = {
    departments: MMDepartment[];
    employees: UserProfile[];
    memberCount: number;
    onDepartmentPress: (dept: MMDepartment) => void;
    onEmployeePress: (emp: UserProfile) => void;
    loading?: boolean;
    error?: boolean;
    emptyMessage?: string;
    testIDPrefix?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    departmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    insetDivider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        marginLeft: 56,
        marginRight: 16,
    },
    folderIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        backgroundColor: changeOpacity(theme.linkColor, 0.12),
        borderRadius: 10,
    },
    listItemAvatar: {
        marginRight: 14,
    },
    listItemName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    memberCountFooter: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        textAlign: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    emptyMessage: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingVertical: 24,
        paddingHorizontal: 20,
        textAlign: 'center',
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
    },
    errorMessage: {
        ...typography('Body', 100),
        color: theme.errorTextColor,
        paddingVertical: 24,
        paddingHorizontal: 20,
        textAlign: 'center',
    },
}));

const ContactDirectoryList = ({
    departments,
    employees,
    memberCount,
    onDepartmentPress,
    onEmployeePress,
    loading = false,
    error = false,
    emptyMessage,
    testIDPrefix = 'contacts.directory',
}: ContactDirectoryListProps) => {
    const theme = useTheme();
    const intl = useIntl();
    const styles = getStyleSheet(theme);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <Loading
                    color={theme.centerChannelColor}
                    size='small'
                />
                <Text style={[styles.emptyMessage, {marginTop: 8}]}>
                    {intl.formatMessage({id: 'contacts.loading', defaultMessage: 'Loading...'})}
                </Text>
            </View>
        );
    }

    if (error) {
        return (
            <Text style={styles.errorMessage}>
                {intl.formatMessage({id: 'contacts.service_unavailable', defaultMessage: 'Contact service is not available'})}
            </Text>
        );
    }

    const hasDepts = departments.length > 0;
    const hasEmps = employees.length > 0;

    if (!hasDepts && !hasEmps) {
        return (
            <Text style={styles.emptyMessage}>
                {emptyMessage ?? intl.formatMessage({id: 'contacts.no_members', defaultMessage: 'No members'})}
            </Text>
        );
    }

    return (
        <>
            {departments.map((dept, deptIdx) => (
                <React.Fragment key={dept.id}>
                    <TouchableOpacity
                        style={styles.departmentRow}
                        onPress={() => onDepartmentPress(dept)}
                        activeOpacity={0.7}
                        testID={`${testIDPrefix}.department.${dept.id}`}
                    >
                        <View style={styles.folderIcon}>
                            <CompassIcon
                                name='folder-outline'
                                size={24}
                                color={theme.linkColor}
                            />
                        </View>
                        <Text
                            style={styles.listItemName}
                            numberOfLines={1}
                        >
                            {dept.name}
                        </Text>
                    </TouchableOpacity>
                    {deptIdx < departments.length - 1 || hasEmps ? (
                        <View style={styles.insetDivider}/>
                    ) : null}
                </React.Fragment>
            ))}
            {employees.map((emp, empIdx) => (
                <React.Fragment key={emp.id}>
                    <TouchableOpacity
                        style={styles.listItem}
                        onPress={() => onEmployeePress(emp)}
                        activeOpacity={0.7}
                        testID={`${testIDPrefix}.employee.${emp.id}`}
                    >
                        <View style={styles.listItemAvatar}>
                            <ContactAvatar
                                employee={emp}
                                size={40}
                            />
                        </View>
                        <Text
                            style={styles.listItemName}
                            numberOfLines={1}
                        >
                            {getContactListDisplayName(emp)}
                        </Text>
                    </TouchableOpacity>
                    {empIdx < employees.length - 1 ? (
                        <View style={styles.insetDivider}/>
                    ) : null}
                </React.Fragment>
            ))}
            {(hasDepts || hasEmps) && (
                <Text style={styles.memberCountFooter}>
                    {intl.formatMessage(
                        {id: 'contacts.member_count', defaultMessage: 'Total {count} members'},
                        {count: memberCount},
                    )}
                </Text>
            )}
        </>
    );
};

export default ContactDirectoryList;
