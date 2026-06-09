/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INodepodService } from 'vs/platform/nodepod/common/nodepodService';
import { INodepodRuntime } from 'vs/platform/nodepod/common/nodepod';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';

export class NodepodService extends Disposable implements INodepodService {
	readonly _serviceBrand: undefined;

	private _runtime: INodepodRuntime | undefined;

	constructor() {
		super();
		this._runtime = this.detectNodepodRuntime();
	}

	get runtime(): INodepodRuntime | undefined {
		return this._runtime;
	}

	async initialize(workspaceUri?: URI): Promise<void> {
		if (!this._runtime) {
			throw new Error('Nodepod runtime not available');
		}

		await this._runtime.session.ready;
	}

	getRuntime(): INodepodRuntime {
		if (!this._runtime) {
			throw new Error('Nodepod runtime not available');
		}
		return this._runtime;
	}

	isAvailable(): boolean {
		return !!this._runtime;
	}

	private detectNodepodRuntime(): INodepodRuntime | undefined {
		const win = window as any;
		if (win.nodepod && win.nodepod.runtime) {
			return win.nodepod.runtime as INodepodRuntime;
		}
		return undefined;
	}
}
