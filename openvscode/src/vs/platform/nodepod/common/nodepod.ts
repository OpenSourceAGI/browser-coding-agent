/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';

export interface INodepodSession {
	readonly id: string;
	readonly workspaceUri?: URI;
	readonly ready: Promise<void>;
	dispose(): void;
}

export interface INodepodMessage {
	readonly type: string;
	readonly id: string;
	readonly data: any;
}

export interface INodepodChannel extends IDisposable {
	readonly onMessage: Event<INodepodMessage>;
	send(message: INodepodMessage): void;
}

export interface INodepodProcessOptions {
	readonly command: string;
	readonly args?: string[];
	readonly cwd?: string;
	readonly env?: { [key: string]: string };
}

export interface INodepodProcess extends IDisposable {
	readonly pid: number;
	readonly onExit: Event<number>;
	readonly onStdout: Event<string>;
	readonly onStderr: Event<string>;

	write(data: string): void;
	resize(cols: number, rows: number): void;
	kill(signal?: string): void;
}

export interface INodepodFileSystemProvider {
	stat(uri: URI): Promise<{ type: number; size: number; mtime: number; ctime: number }>;
	readdir(uri: URI): Promise<[string, number][]>;
	readFile(uri: URI): Promise<Uint8Array>;
	writeFile(uri: URI, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void>;
	delete(uri: URI, options: { recursive: boolean }): Promise<void>;
	rename(from: URI, to: URI, options: { overwrite: boolean }): Promise<void>;
	mkdir(uri: URI): Promise<void>;
	watch(uri: URI): IDisposable;
	readonly onDidChange: Event<URI[]>;
}

export const enum NodepodCapability {
	Terminal = 1 << 0,
	FileSystem = 1 << 1,
	Process = 1 << 2,
	BrowserExecution = 1 << 3,
	NodeExtensions = 1 << 4,
	BrowserExtensions = 1 << 5
}

export interface INodepodRuntime {
	readonly capabilities: NodepodCapability;
	readonly session: INodepodSession;

	createProcess(options: INodepodProcessOptions): Promise<INodepodProcess>;
	getFileSystemProvider(): INodepodFileSystemProvider;
	createChannel(name: string): INodepodChannel;
	executeCode(code: string): Promise<any>;
}
