/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {localize} from 'vs/nls';
import {Action} from 'vs/base/common/actions';
import {join} from 'vs/base/common/paths';
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import {IExtensionService, IExtensionDescription} from 'vs/platform/extensions/common/extensions';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IExtensionMessageCollector, ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';

export interface ResourceFilter {
	language?: string;
	scheme?: string;
	pattern?: string;
}

export type Where = 'editor/primary' | 'editor/secondary' | 'explorer/context';

export interface Context {
	where: Where;
	when: string | string[] | ResourceFilter | ResourceFilter[];
}

export interface ThemableIcon {
	dark: string;
	light: string;
}


export interface Command {
	command: string;
	title: string;
	category?: string;
	icon?: string | ThemableIcon;
	context?: Context | Context[];
}

function isThemableIcon(thing: any): thing is ThemableIcon {
	return typeof thing === 'object' && thing && typeof (<ThemableIcon>thing).dark === 'string' && typeof (<ThemableIcon>thing).light === 'string';
}

function isCommands(thing: Command | Command[]): thing is Command[] {
	return Array.isArray(thing);
}
function isContexts(thing: Context | Context[]): thing is Context[] {
	return Array.isArray(thing);
}

namespace validation {


	function isValidIcon(icon: string | ThemableIcon, reject: string[]): boolean {
		if (typeof icon === 'undefined') {
			return true;
		}
		if (typeof icon === 'string') {
			return true;
		}
		if (typeof icon === 'object' && typeof (<ThemableIcon>icon).dark === 'string' && typeof (<ThemableIcon>icon).light === 'string') {
			return true;
		}
		reject.push(localize('opticon', "property `icon` can be omitted or must be either a string or a literal like `{dark, light}`"));
		return false;
	}

	function isValidContext(context: Context, rejects: string[]): boolean {
		if (!context) {
			return true;
		}
		if (context.where !== 'editor/primary' && context.where !== 'editor/secondary' && context.where !== 'explorer/context') {
			rejects.push(localize('requireenumtype', "property `where` is mandatory and must be one of `editor/primary`, `editor/secondary`, or `explorer/context`"));
			return false;
		}
		if (typeof context.when !== 'object' && typeof context.when !== 'string' && !Array.isArray(context.when)) {
			rejects.push(localize('requirefilter', "property `when` is mandatory and must be like `{language, scheme, pattern}`"));
			return false;
		}
		return true;
	}

	export function isValidCommand(candidate: Command, rejects: string[]): boolean {
		if (!candidate) {
			rejects.push(localize('nonempty', "expected non-empty value."));
			return false;
		}
		if (typeof candidate.command !== 'string') {
			rejects.push(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'command'));
			return false;
		}
		if (typeof candidate.title !== 'string') {
			rejects.push(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'title'));
			return false;
		}
		if (candidate.category && typeof candidate.category !== 'string') {
			rejects.push(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'category'));
			return false;
		}
		if (!isValidIcon(candidate.icon, rejects)) {
			return false;
		}
		if (candidate.context) {
			let {context} = candidate;
			if (isContexts(context)) {
				if (!context.every(context => isValidContext(context, rejects))) {
					return false;
				}
			} else if (!isValidContext(context, rejects)) {
				return false;
			}
		}
		return true;
	}

}


namespace schema {

	const filterType: IJSONSchema = {
		type: 'object',
		properties: {
			language: {
				description: localize('vscode.extension.contributes.filterType.language', ""),
				type: 'string'
			},
			scheme: {
				description: localize('vscode.extension.contributes.filterType.scheme', ""),
				type: 'string'
			},
			pattern: {
				description: localize('vscode.extension.contributes.filterType.pattern', ""),
				type: 'string'
			}
		}
	};

	const contextType: IJSONSchema = {
		type: 'object',
		properties: {
			where: {
				description: localize('vscode.extension.contributes.commandType.context.where', "Menus and tool bars to which commands can be added, e.g. `editor title actions` or `explorer context menu`"),
				enum: [
					'editor/primary',
					'editor/secondary'
				]
			},
			when: {
				description: localize('vscode.extension.contributes.commandType.context.when', "Condition that must be met in order to show the command. Can be a language identifier, a glob-pattern, an uri scheme, or a combination of them."),
				anyOf: [
					'string',
					filterType,
					{ type: 'array', items: 'string' },
					{ type: 'array', items: filterType },
				]
			}
		}
	};

	const commandType: IJSONSchema = {
		type: 'object',
		properties: {
			command: {
				description: localize('vscode.extension.contributes.commandType.command', 'Identifier of the command to execute'),
				type: 'string'
			},
			title: {
				description: localize('vscode.extension.contributes.commandType.title', 'Title by which the command is represented in the UI'),
				type: 'string'
			},
			category: {
				description: localize('vscode.extension.contributes.commandType.category', '(Optional) Category string by the command is grouped in the UI'),
				type: 'string'
			},
			icon: {
				description: localize('vscode.extension.contributes.commandType.icon', '(Optional) Icon which is used to represent the command in the UI. Either a file path or a themable configuration'),
				oneOf: [
					'string',
					{
						type: 'object',
						properties: {
							light: {
								description: localize('vscode.extension.contributes.commandType.icon.light', 'Icon path when a light theme is used'),
								type: 'string'
							},
							dark: {
								description: localize('vscode.extension.contributes.commandType.icon.dark', 'Icon path when a dark theme is used'),
								type: 'string'
							}
						}
					}
				]
			},
			context: {
				description: localize('vscode.extension.contributes.commandType.context', '(Optional) Define places where the command should show in addition to the Command palette'),
				oneOf: [
					contextType,
					{ type: 'array', items: contextType }
				]
			}
		}
	};

	export const commandContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.commands', "Contributes commands to the command palette."),
		oneOf: [
			commandType,
			{
				type: 'array',
				items: commandType
			}
		]
	};
}

export const commands: Command[] = [];

function handleCommand(command: Command, collector: IExtensionMessageCollector, description: IExtensionDescription): void {

	let rejects: string[] = [];

	if (validation.isValidCommand(command, rejects)) {

		// make icon paths absolute
		let {icon} = command;
		if (typeof icon === 'string') {
			command.icon = join(description.extensionFolderPath, icon);
		} else if(isThemableIcon(icon)) {
			icon.dark = join(description.extensionFolderPath, icon.dark);
			icon.light = join(description.extensionFolderPath, icon.light);
		}

		// store command globally
		commands.push(command);

	} else if (rejects.length > 0) {
		collector.error(localize(
			'error',
			"Invalid `contributes.commands`: {0}",
			rejects.join('\n')
		));
	}
}

ExtensionsRegistry.registerExtensionPoint<Command | Command[]>('commands', schema.commandContribution).setHandler(extensions => {
	for (let extension of extensions) {
		const {value, collector, description} = extension;
		if (isCommands(value)) {
			for (let command of value) {
				handleCommand(command, collector, description);
			}
		} else {
			handleCommand(value, collector, description);
		}
	}

	Object.freeze(commands);
});

export class CommandAction extends Action {

	constructor(
		public command: Command,
		@IExtensionService extensionService: IExtensionService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(command.command, command.title);

		// callback that (1) activates the extension and (2) dispatches the command
		const activationEvent = `onCommand:${command.command}`;
		this._actionCallback = (...args: any[]) => {
			return extensionService.activateByEvent(activationEvent).then(() => {
				return keybindingService.executeCommand(command.command, ...args);
			});
		};
	}
}
