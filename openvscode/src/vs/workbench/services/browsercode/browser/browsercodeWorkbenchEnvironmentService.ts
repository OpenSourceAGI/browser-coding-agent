/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IBrowserCodeService } from 'vs/platform/browsercode/common/browsercodeService';

export class BrowserCodeWorkbenchEnvironmentService implements Partial<IWorkbenchEnvironmentService> {
	constructor(
		private readonly browsercodeService: IBrowserCodeService,
		private readonly baseEnvironmentService: IWorkbenchEnvironmentService
	) {}

	get remoteAuthority(): string | undefined {
		return 'browsercode';
	}

	get isBuilt(): boolean {
		return this.baseEnvironmentService.isBuilt;
	}

	get logLevel(): string | undefined {
		return this.baseEnvironmentService.logLevel;
	}

	get logsPath(): URI {
		return this.baseEnvironmentService.logsPath;
	}

	get userDataPath(): string {
		return this.baseEnvironmentService.userDataPath;
	}

	get settingsResource(): URI {
		return this.baseEnvironmentService.settingsResource;
	}

	get keybindingsResource(): URI {
		return this.baseEnvironmentService.keybindingsResource;
	}

	get snippetsHome(): URI {
		return this.baseEnvironmentService.snippetsHome;
	}

	get globalStorageHome(): URI {
		return this.baseEnvironmentService.globalStorageHome;
	}

	get workspaceStorageHome(): URI {
		return this.baseEnvironmentService.workspaceStorageHome;
	}

	get localHistoryHome(): URI {
		return this.baseEnvironmentService.localHistoryHome;
	}

	get userRoamingDataHome(): URI {
		return this.baseEnvironmentService.userRoamingDataHome;
	}

	get extensionDevelopmentLocationURI(): URI[] | undefined {
		return this.baseEnvironmentService.extensionDevelopmentLocationURI;
	}

	get extensionTestsLocationURI(): URI | undefined {
		return this.baseEnvironmentService.extensionTestsLocationURI;
	}

	get debugExtensionHost(): { port: number; break: boolean } | undefined {
		return this.baseEnvironmentService.debugExtensionHost;
	}

	get isExtensionDevelopment(): boolean {
		return this.baseEnvironmentService.isExtensionDevelopment;
	}

	get disableExtensions(): boolean | string[] {
		return this.baseEnvironmentService.disableExtensions;
	}

	get enableExtensions(): string[] | undefined {
		return this.baseEnvironmentService.enableExtensions;
	}
}
