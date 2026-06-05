/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IBrowserCodeRuntime } from 'vs/platform/browsercode/common/browsercode';
import { URI } from 'vs/base/common/uri';

export const IBrowserCodeService = createDecorator<IBrowserCodeService>('browsercodeService');

export interface IBrowserCodeService {
	readonly _serviceBrand: undefined;

	readonly runtime: IBrowserCodeRuntime | undefined;

	initialize(workspaceUri?: URI): Promise<void>;
	getRuntime(): IBrowserCodeRuntime;
	isAvailable(): boolean;
}
