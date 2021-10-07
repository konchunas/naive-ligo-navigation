/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { execSync } from "child_process";

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}


export function activate(context: vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders == undefined) { return } //only works for workspaces

	const provider = vscode.languages.registerDefinitionProvider(
		'ligo',
		{
			provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {

				const range: vscode.Range = document.getWordRangeAtPosition(position)!
				const word = document.getText(range)

				const nextSymbolRange = new vscode.Range(range.end, range.end.with({ character: range.end.character + 1 }))
				const nextSymbol = document.getText(nextSymbolRange)

				const prevSymbolRange = new vscode.Range(range.start.with({ character: range.start.character - 1 }), range.start)
				const prevSymbol = document.getText(prevSymbolRange)

				const isFirstLetterUppercase = word[0].toUpperCase() == word[0]

				let query = null
				if (nextSymbol == "(") {
					if (isFirstLetterUppercase) {
						query = "[|]\\s+" + word // pipe and then multiple spaces and the word
					} else {
						query = "function " + word
					}
				}
				else if (prevSymbol == ".") {
					query = " " + word + "\\s+: " //word with multiple spaces and semicolon and space
				}
				else {
					query = "type " + word + " "
				}

				const locations: vscode.Location[] = []

				if (query) {
					if (vscode.workspace.workspaceFolders !== undefined) {
						console.log(`git grep --untracked -n -I -G "${query}"`)
						const searches = execSync(`git grep --untracked -n -I -E "${query}"`, {
							cwd: vscode.workspace.workspaceFolders[0].uri.path,
							encoding: 'utf8',
							maxBuffer: 50 * 1024 * 1024
						})
						if (searches) {
							const findings = searches.split("\n")
							for (const finding of findings) {
								if (finding == "") continue
								const [file, line, text] = finding.split(":")

								// find a word cursor to highlight it properly
								const vscodeLine = parseInt(line) - 1
								const rangeStartColumn = text.indexOf(word)
								const rangeStartPos = new vscode.Position(vscodeLine, rangeStartColumn)
								const rangeEndPos = new vscode.Position(vscodeLine, rangeStartColumn + word.length)
								const range = new vscode.Range(rangeStartPos, rangeEndPos)

								const path = vscode.workspace.workspaceFolders[0].uri.path + "/" + file
								const location: vscode.Location = new vscode.Location(vscode.Uri.parse(path), range)
								locations.push(location)
							}
						}
					}
				}
				return locations
			}
		}
	)

	context.subscriptions.push(provider);
}
