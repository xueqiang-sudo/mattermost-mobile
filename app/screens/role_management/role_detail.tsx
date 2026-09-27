// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    ScrollView,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {popTopScreen} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {RoleInfo} from './role_list';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    role: RoleInfo;
};

type PermissionNode = {
    id: string;
    name: string;
    description?: string;
    children?: PermissionNode[];
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerButton: {padding: 8},
    headerTitle: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'center',
        marginRight: 40,
    },
    content: {
        padding: 16,
    },
    section: {
        marginBottom: 16,
    },
    sectionTitle: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 8,
    },
    infoRow: {
        flexDirection: 'row',
        paddingVertical: 8,
    },
    infoLabel: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        width: 120,
    },
    infoValue: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    permissionGroup: {
        marginBottom: 12,
    },
    permissionGroupTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    permissionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingLeft: 16,
    },
    permissionText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        flex: 1,
    },
    saveButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 16,
    },
    saveButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
}));

const PERMISSION_TREE: PermissionNode[] = [
    {
        id: 'sysconsole_read',
        name: 'Read',
        children: [
            {id: 'sysconsole_read_user_management_users', name: 'User Management'},
            {id: 'sysconsole_read_user_management_groups', name: 'Groups'},
            {id: 'sysconsole_read_user_management_channels', name: 'Channels'},
            {id: 'sysconsole_read_user_management_teams', name: 'Teams'},
        ],
    },
    {
        id: 'sysconsole_write',
        name: 'Write',
        children: [
            {id: 'sysconsole_write_user_management_users', name: 'User Management'},
            {id: 'sysconsole_write_user_management_groups', name: 'Groups'},
            {id: 'sysconsole_write_user_management_channels', name: 'Channels'},
            {id: 'sysconsole_write_user_management_teams', name: 'Teams'},
        ],
    },
    {
        id: 'manage_team',
        name: 'Team Management',
        children: [
            {id: 'create_team', name: 'Create Team'},
            {id: 'manage_team_roles', name: 'Manage Team Roles'},
        ],
    },
    {
        id: 'manage_channel',
        name: 'Channel Management',
        children: [
            {id: 'create_public_channel', name: 'Create Public Channel'},
            {id: 'create_private_channel', name: 'Create Private Channel'},
            {id: 'manage_public_channel_properties', name: 'Manage Public Channel'},
            {id: 'manage_private_channel_properties', name: 'Manage Private Channel'},
        ],
    },
];

const RoleDetailScreen = ({componentId, role}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [permissions, setPermissions] = useState<Set<string>>(new Set(role.permissions));
    const [saving, setSaving] = useState(false);

    const handleBack = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    const togglePermission = useCallback((permissionId: string) => {
        setPermissions((prev) => {
            const next = new Set(prev);
            if (next.has(permissionId)) {
                next.delete(permissionId);
            } else {
                next.add(permissionId);
            }
            return next;
        });
    }, []);

    const handleSave = usePreventDoubleTap(useCallback(async () => {
        setSaving(true);
        try {
            const {default: NetworkManager} = await import('@managers/network_manager');
            const client = NetworkManager.getClient(serverUrl);
            await client.doFetch(`/roles/${role.id}/patch`, {
                method: 'put',
                body: JSON.stringify({permissions: Array.from(permissions)}),
            });
            Alert.alert(
                intl.formatMessage({id: 'role_management.save_success', defaultMessage: 'Success'}),
                intl.formatMessage({id: 'role_management.save_success_message', defaultMessage: 'Role permissions updated successfully.'}),
                [{text: 'OK', onPress: handleBack}],
            );
        } catch (error) {
            Alert.alert(
                intl.formatMessage({id: 'role_management.save_error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'role_management.save_error_message', defaultMessage: 'Failed to save role permissions. Please try again.'}),
            );
        } finally {
            setSaving(false);
        }
    }, [role.id, permissions, serverUrl, intl, handleBack]));

    const renderPermissionNode = useCallback((node: PermissionNode, depth = 0) => {
        const isEnabled = permissions.has(node.id);
        const hasChildren = node.children && node.children.length > 0;

        if (hasChildren) {
            return (
                <View key={node.id} style={styles.permissionGroup}>
                    <Text style={styles.permissionGroupTitle}>{node.name}</Text>
                    {node.children!.map((child) => renderPermissionNode(child, depth + 1))}
                </View>
            );
        }

        return (
            <View key={node.id} style={[styles.permissionRow, {paddingLeft: 16 + depth * 16}]}>
                <Text style={styles.permissionText}>{node.name}</Text>
                <Switch
                    value={isEnabled}
                    onValueChange={() => togglePermission(node.id)}
                />
            </View>
        );
    }, [permissions, styles, togglePermission]);

    const hasChanges = useMemo(() => {
        const originalSet = new Set(role.permissions);
        if (permissions.size !== originalSet.size) {
            return true;
        }
        for (const perm of permissions) {
            if (!originalSet.has(perm)) {
                return true;
            }
        }
        return false;
    }, [permissions, role.permissions]);

    return (
        <SafeAreaView style={styles.flex} testID='role_management.detail'>
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
                    <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {role.display_name || role.name}
                </Text>
                <View style={{width: 40}}/>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        {intl.formatMessage({id: 'role_management.info', defaultMessage: 'Role Information'})}
                    </Text>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Name:</Text>
                        <Text style={styles.infoValue}>{role.name}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Display Name:</Text>
                        <Text style={styles.infoValue}>{role.display_name || '-'}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Description:</Text>
                        <Text style={styles.infoValue}>{role.description || '-'}</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        {intl.formatMessage({id: 'role_management.permissions', defaultMessage: 'Permissions'})}
                    </Text>
                    {PERMISSION_TREE.map((node) => renderPermissionNode(node))}
                </View>

                {hasChanges && (
                    <TouchableOpacity
                        style={styles.saveButton}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        <Text style={styles.saveButtonText}>
                            {saving
                                ? intl.formatMessage({id: 'role_management.saving', defaultMessage: 'Saving...'})
                                : intl.formatMessage({id: 'role_management.save', defaultMessage: 'Save Changes'})}
                        </Text>
                    </TouchableOpacity>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

export default RoleDetailScreen;
