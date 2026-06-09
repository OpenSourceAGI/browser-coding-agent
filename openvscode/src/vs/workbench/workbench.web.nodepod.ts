/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchConstructionOptions, create } from 'vs/workbench/browser/web.main';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { INodepodService } from 'vs/platform/nodepod/common/nodepodService';
import { NodepodService } from 'vs/platform/nodepod/browser/nodepodService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

registerSingleton(INodepodService, NodepodService, true);

export interface INodepodWorkbenchOptions extends IWorkbenchConstructionOptions {
	workspaceUri?: URI;
}

export async function createNodepodWorkbench(
	domElement: HTMLElement,
	options: INodepodWorkbenchOptions
): Promise<void> {
	const workbenchOptions: IWorkbenchConstructionOptions = {
		...options,
		remoteAuthority: 'nodepod',
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

(window as any).createNodepodWorkbench = createNodepodWorkbench;
