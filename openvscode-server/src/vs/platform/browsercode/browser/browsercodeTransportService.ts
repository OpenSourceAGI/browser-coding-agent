/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IBrowserCodeChannel, IBrowserCodeMessage } from 'vs/platform/browsercode/common/browsercode';
import { IBrowserCodeService } from 'vs/platform/browsercode/common/browsercodeService';
import { VSBuffer } from 'vs/base/common/buffer';

export interface IBrowserCodeTransportService {
	readonly _serviceBrand: undefined;

	createChannel(name: string): Promise<IBrowserCodeTransportChannel>;
}

export interface IBrowserCodeTransportChannel extends Disposable {
	readonly onMessage: Event<VSBuffer>;
	send(message: VSBuffer): void;
}

class BrowserCodeTransportChannel extends Disposable implements IBrowserCodeTransportChannel {
	private readonly _onMessage = this._register(new Emitter<VSBuffer>());
	readonly onMessage = this._onMessage.event;

	constructor(
		private readonly channel: IBrowserCodeChannel
	) {
		super();

		this._register(channel.onMessage(msg => {
			this._onMessage.fire(this.messageToBuffer(msg));
		}));
	}

	send(message: VSBuffer): void {
		const msg = this.bufferToMessage(message);
		this.channel.send(msg);
	}

	private messageToBuffer(message: IBrowserCodeMessage): VSBuffer {
		const json = JSON.stringify(message);
		return VSBuffer.fromString(json);
	}

	private bufferToMessage(buffer: VSBuffer): IBrowserCodeMessage {
		const json = buffer.toString();
		return JSON.parse(json);
	}

	override dispose(): void {
		super.dispose();
		this.channel.dispose();
	}
}

export class BrowserCodeTransportService extends Disposable implements IBrowserCodeTransportService {
	readonly _serviceBrand: undefined;

	constructor(
		@IBrowserCodeService private readonly browsercodeService: IBrowserCodeService
	) {
		super();
	}

	async createChannel(name: string): Promise<IBrowserCodeTransportChannel> {
		const runtime = this.browsercodeService.getRuntime();
		const channel = runtime.createChannel(name);
		return new BrowserCodeTransportChannel(channel);
	}
}
