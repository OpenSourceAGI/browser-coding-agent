/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBrowserCodeService } from 'vs/platform/browsercode/common/browsercodeService';
import { IBrowserCodeRuntime } from 'vs/platform/browsercode/common/browsercode';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';

export class BrowserCodeService extends Disposable implements IBrowserCodeService {
	readonly _serviceBrand: undefined;

	private _runtime: IBrowserCodeRuntime | undefined;

	constructor() {
		super();
		this._runtime = this.detectBrowserCodeRuntime();
	}

	get runtime(): IBrowserCodeRuntime | undefined {
		return this._runtime;
	}

	async initialize(workspaceUri?: URI): Promise<void> {
		if (!this._runtime) {
			throw new Error('BrowserCode runtime not available');
		}

		await this._runtime.session.ready;
	}

	getRuntime(): IBrowserCodeRuntime {
		if (!this._runtime) {
			throw new Error('BrowserCode runtime not available');
		}
		return this._runtime;
	}

	isAvailable(): boolean {
		return !!this._runtime;
	}

	private detectBrowserCodeRuntime(): IBrowserCodeRuntime | undefined {
		const win = window as any;
		if (win.browsercode && win.browsercode.runtime) {
			return win.browsercode.runtime as IBrowserCodeRuntime;
		}
		return undefined;
	}
}
