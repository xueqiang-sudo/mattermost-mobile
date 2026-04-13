// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// *******************************************************************
// - [#] indicates a test step (e.g. # Go to a screen)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element testID when selecting an element. Create one if none.
// *******************************************************************

import {Setup, System} from '@support/server_api';
import {
    serverOneUrl,
    siteOneUrl,
} from '@support/test_config';
import {
    AccountScreen,
    HomeScreen,
    LoginScreen,
    AboutScreen,
    ServerScreen,
    SettingsScreen,
} from '@support/ui/screen';
import {expect} from 'detox';

describe('Account - Settings - About', () => {
    const serverOneDisplayName = 'Server 1';
    let testUser: any;

    beforeAll(async () => {
        await System.apiGetClientLicense(siteOneUrl);
        const {user} = await Setup.apiInit(siteOneUrl);
        testUser = user;

        await ServerScreen.connectToServer(serverOneUrl, serverOneDisplayName);
        await LoginScreen.login(testUser);
        await AccountScreen.open();
        await SettingsScreen.open();
        await AboutScreen.open();
    });

    beforeEach(async () => {
        await AboutScreen.toBeVisible();
    });

    afterAll(async () => {
        await AboutScreen.back();
        await SettingsScreen.close();
        await HomeScreen.logout();
    });

    it('MM-T5104_1 - should match elements on about screen', async () => {
        await expect(AboutScreen.backButton).toBeVisible();
        await expect(AboutScreen.logo).toBeVisible();
        await expect(AboutScreen.siteName).toBeVisible();
        await expect(AboutScreen.title).toBeVisible();
        await expect(AboutScreen.subtitle).toBeVisible();
        await expect(AboutScreen.cardTitle).toHaveText('App information');
        await expect(AboutScreen.appVersionTitle).toHaveText('Version');
        await expect(AboutScreen.appVersionValue).toBeVisible();
        await expect(AboutScreen.buildNumberTitle).toHaveText('Build');
        await expect(AboutScreen.buildNumberValue).toBeVisible();
        await expect(AboutScreen.copyInfoButton).toBeVisible();
        await expect(element(by.text(new RegExp('Copy version info', 'i')))).toBeVisible();

        const year = new Date().getFullYear();
        await expect(AboutScreen.copyright).toHaveText(`© ${year} Optibot. All rights reserved.`);
    });
});
