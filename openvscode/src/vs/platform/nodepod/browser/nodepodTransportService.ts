/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { INodepodChannel, INodepodMessage } from 'vs/platform/nodepod/common/nodepod';
import { INodepodService } from 'vs/platform/nodepod/common/nodepodService';
import { VSBuffer } from 'vs/base/common/buffer';

export interface INodepodTransportService {
	readonly _serviceBrand: undefined;

	createChannel(name: string): Promise<INodepodTransportChannel>;
}

export interface INodepodTransportChannel extends Disposable {
	readonly onMessage: Event<VSBuffer>;
	send(message: VSBuffer): void;
}

class NodepodTransportChannel extends Disposable implements INodepodTransportChannel {
	private readonly _onMessage = this._register(new Emitter<VSBuffer>());
	readonly onMessage = this._onMessage.event;

	constructor(
		private readonly channel: INodepodChannel
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

	private messageToBuffer(message: INodepodMessage): VSBuffer {
		const json = JSON.stringify(message);
		return VSBuffer.fromString(json);
	}

	private bufferToMessage(buffer: VSBuffer): INodepodMessage {
		const json = buffer.toString();
		return JSON.parse(json);
	}

	override dispose(): void {
		super.dispose();
		this.channel.dispose();
	}
}

export class NodepodTransportService extends Disposable implements INodepodTransportService {
	readonly _serviceBrand: undefined;

	constructor(
		@INodepodService private readonly nodepodService: INodepodService
	) {
		super();
	}

	async createChannel(name: string): Promise<INodepodTransportChannel> {
		const runtime = this.nodepodService.getRuntime();
		const channel = runtime.createChannel(name);
		return new NodepodTransportChannel(channel);
	}
}
