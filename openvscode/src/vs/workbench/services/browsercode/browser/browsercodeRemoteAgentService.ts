/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IBrowserCodeService } from 'vs/platform/browsercode/common/browsercodeService';
import { IRemoteAgentService, IRemoteAgentConnection } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { OperatingSystem, OS } from 'vs/base/common/platform';

export class BrowserCodeRemoteAgentService extends Disposable implements Partial<IRemoteAgentService> {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnection = this._register(new Emitter<void>());
	readonly onDidChangeConnection = this._onDidChangeConnection.event;

	private _connection: IRemoteAgentConnection | null = null;
	private _environment: IRemoteAgentEnvironment | null = null;

	constructor(
		private readonly browsercodeService: IBrowserCodeService
	) {
		super();
		this.initialize();
	}

	private async initialize(): Promise<void> {
		if (!this.browsercodeService.isAvailable()) {
			return;
		}

		const runtime = this.browsercodeService.getRuntime();
		await runtime.session.ready;

		this._environment = {
			pid: 1,
			connectionToken: 'browsercode-token',
			appRoot: runtime.session.workspaceUri || { fsPath: '/', scheme: 'file', path: '/' } as any,
			settingsPath: { fsPath: '/.vscode/settings.json', scheme: 'file', path: '/.vscode/settings.json' } as any,
			logsPath: { fsPath: '/.vscode/logs', scheme: 'file', path: '/.vscode/logs' } as any,
			extensionsPath: { fsPath: '/.vscode/extensions', scheme: 'file', path: '/.vscode/extensions' } as any,
			extensionHostLogsPath: { fsPath: '/.vscode/logs/exthost', scheme: 'file', path: '/.vscode/logs/exthost' } as any,
			globalStorageHome: { fsPath: '/.vscode/globalStorage', scheme: 'file', path: '/.vscode/globalStorage' } as any,
			workspaceStorageHome: { fsPath: '/.vscode/workspaceStorage', scheme: 'file', path: '/.vscode/workspaceStorage' } as any,
			userHome: { fsPath: '/home/browsercode', scheme: 'file', path: '/home/browsercode' } as any,
			os: OS,
			arch: 'x64',
			marks: []
		};

		this._connection = {
			getChannel: (channelName: string) => {
				const channel = runtime.createChannel(channelName);
				return {
					call: async (command: string, args?: any) => {
						channel.send({
							type: 'call',
							id: this.generateId(),
							data: { command, args }
						});
						return new Promise((resolve) => {
							const disposable = channel.onMessage((msg: any) => {
								if (msg.type === 'response') {
									disposable.dispose();
									resolve(msg.data);
								}
							});
						});
					},
					listen: (event: string, args?: any) => {
						return new Emitter<any>().event;
					}
				} as any;
			},
			withChannel: async (channelName: string, callback: any) => {
				const channel = runtime.createChannel(channelName);
				try {
					return await callback({
						call: async (command: string, args?: any) => {
							channel.send({
								type: 'call',
								id: this.generateId(),
								data: { command, args }
							});
							return new Promise((resolve) => {
								const disposable = channel.onMessage((msg: any) => {
									if (msg.type === 'response') {
										disposable.dispose();
										resolve(msg.data);
									}
								});
							});
						},
						listen: (event: string, args?: any) => {
							return new Emitter<any>().event;
						}
					});
				} finally {
					channel.dispose();
				}
			},
			registerChannel: (channelName: string, channel: any) => {},
			getInitialConnectionTimeMs: () => 0,
			getReplayTime: () => 0
		} as any;

		this._onDidChangeConnection.fire();
	}

	getConnection(): IRemoteAgentConnection | null {
		return this._connection;
	}

	async getEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		if (!this._environment) {
			await this.initialize();
		}
		return this._environment;
	}

	async getRawEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		return this.getEnvironment();
	}

	async getExtensionHostExitInfo(reconnectionToken: string): Promise<any | null> {
		return null;
	}

	async whenExtensionsReady(): Promise<void> {
		// Extensions are always ready in BrowserCode
	}

	async scanExtensions(): Promise<any[]> {
		return [];
	}

	async scanSingleExtension(extensionLocation: any, isBuiltin: boolean): Promise<any | null> {
		return null;
	}

	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}
}
