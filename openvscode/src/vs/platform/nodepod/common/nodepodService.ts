/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INodepodRuntime } from 'vs/platform/nodepod/common/nodepod';
import { URI } from 'vs/base/common/uri';

export const INodepodService = createDecorator<INodepodService>('nodepodService');

export interface INodepodService {
	readonly _serviceBrand: undefined;

	readonly runtime: INodepodRuntime | undefined;

	initialize(workspaceUri?: URI): Promise<void>;
	getRuntime(): INodepodRuntime;
	isAvailable(): boolean;
}
