// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import NetworkManager from '@managers/network_manager';

import type {Announcement, AnnouncementFormData} from './types';

async function apiFetch(serverUrl: string, path: string, options: {method: string; body?: any}): Promise<any> {
    const client = NetworkManager.getClient(serverUrl);
    return client.doFetch(path, {method: options.method, ...(options.body ? {body: options.body} : {})});
}

export async function fetchAnnouncements(serverUrl: string, teamId: string): Promise<Announcement[]> {
    const data = await apiFetch(serverUrl, `/api/v4/teams/${teamId}/announcements`, {method: 'get'});
    return data?.announcements || [];
}

export async function fetchAnnouncementDetail(serverUrl: string, teamId: string, id: string): Promise<Announcement> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/announcements/${id}`, {method: 'get'});
}

export async function createAnnouncement(serverUrl: string, teamId: string, formData: AnnouncementFormData): Promise<Announcement> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/announcements`, {method: 'post', body: formData});
}

export async function updateAnnouncement(serverUrl: string, teamId: string, id: string, formData: AnnouncementFormData): Promise<Announcement> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/announcements/${id}`, {method: 'put', body: formData});
}

export async function deleteAnnouncement(serverUrl: string, teamId: string, id: string): Promise<void> {
    await apiFetch(serverUrl, `/api/v4/teams/${teamId}/announcements/${id}`, {method: 'delete'});
}

export async function togglePinAnnouncement(serverUrl: string, teamId: string, id: string, isPinned: boolean): Promise<Announcement> {
    return apiFetch(serverUrl, `/api/v4/teams/${teamId}/announcements/${id}/pin`, {method: 'post', body: {is_pinned: isPinned}});
}
