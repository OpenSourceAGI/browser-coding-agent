/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchConstructionOptions, create } from 'vs/workbench/browser/web.main';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IBrowserCodeService } from 'vs/platform/browsercode/common/browsercodeService';
import { BrowserCodeService } from 'vs/platform/browsercode/browser/browsercodeService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

registerSingleton(IBrowserCodeService, BrowserCodeService, true);

export interface IBrowserCodeWorkbenchOptions extends IWorkbenchConstructionOptions {
	workspaceUri?: URI;
}

export async function createBrowserCodeWorkbench(
	domElement: HTMLElement,
	options: IBrowserCodeWorkbenchOptions
): Promise<void> {
	const workbenchOptions: IWorkbenchConstructionOptions = {
		...options,
		remoteAuthority: 'browsercode',
		configurationDefaults: {
			...options.configurationDefaults,
			'workbench.enableExperiments': false
		}
	};

	const workbench = await create(domElement, workbenchOptions);

	if (options.workspaceUri) {
		const editorService = workbench.serviceCollection.get(IEditorService) as IEditorService;
		if (editorService) {
			await editorService.openEditor({
				resource: options.workspaceUri,
				options: { pinned: true }
			});
		}
	}

	return workbench;
}

(window as any).createBrowserCodeWorkbench = createBrowserCodeWorkbench;
