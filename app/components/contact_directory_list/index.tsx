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
import {buildEnterpriseUserTagKeys, type EnterpriseUserTagKey} from '@utils/enterprise_user_tags';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {MMDepartment} from '@client/rest/team_department';

export type ContactDirectoryListProps = {
    departments: MMDepartment[];
    employees: UserProfile[];
    managerIds?: Set<string>;
    ownerId?: string;
    currentUserId?: string;
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
    },
    listItemMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
        gap: 8,
    },
    managerTag: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.buttonBg, 0.14),
        borderWidth: 1,
        borderColor: changeOpacity(theme.buttonBg, 0.35),
    },
    managerTagText: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
    },
    selfTag: {
        backgroundColor: changeOpacity(theme.onlineIndicator, 0.12),
        borderColor: changeOpacity(theme.onlineIndicator, 0.35),
    },
    selfTagText: {
        color: theme.onlineIndicator,
    },
    ownerTag: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.14),
        borderColor: changeOpacity(theme.buttonBg, 0.35),
    },
    ownerTagText: {
        color: theme.buttonBg,
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
    managerIds,
    ownerId,
    currentUserId,
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
                        <View style={styles.listItemMain}>
                            <Text
                                style={styles.listItemName}
                                numberOfLines={1}
                            >
                                {getContactListDisplayName(emp)}
                            </Text>
                            {buildEnterpriseUserTagKeys({
                                userId: emp.id,
                                ownerId,
                                currentUserId,
                                managerIds,
                            }).map((tagKey: EnterpriseUserTagKey) => {
                                if (tagKey === 'owner') {
                                    return (
                                        <View
                                            key={`${emp.id}-owner`}
                                            style={[styles.managerTag, styles.ownerTag]}
                                        >
                                            <Text style={[styles.managerTagText, styles.ownerTagText]}>
                                                {intl.formatMessage({id: 'contacts.owner_tag', defaultMessage: 'Owner'})}
                                            </Text>
                                        </View>
                                    );
                                }
                                if (tagKey === 'self') {
                                    return (
                                        <View
                                            key={`${emp.id}-self`}
                                            style={[styles.managerTag, styles.selfTag]}
                                        >
                                            <Text style={[styles.managerTagText, styles.selfTagText]}>
                                                {intl.formatMessage({id: 'contacts.self_tag', defaultMessage: 'Self'})}
                                            </Text>
                                        </View>
                                    );
                                }
                                return (
                                    <View
                                        key={`${emp.id}-manager`}
                                        style={styles.managerTag}
                                    >
                                        <Text style={styles.managerTagText}>
                                            {intl.formatMessage({id: 'contacts.manager_tag', defaultMessage: 'Manager'})}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
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
