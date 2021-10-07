/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}


export function activate(context: vscode.ExtensionContext) {

	const provider = vscode.languages.registerDeclarationProvider(
		'ligo',
		{
			provideDeclaration(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
				const range: vscode.Range = document.getWordRangeAtPosition(position)!
				const word = document.getText(range)

				const nextSymbolRange = new vscode.Range(range.end, range.end.with({ character: range.end.character + 1 }))
				const nextSymbol = document.getText(nextSymbolRange)

				const prevSymbolRange = new vscode.Range(range.start.with({ character: range.start.character - 1 }), range.start)
				const prevSymbol = document.getText(prevSymbolRange)

				const twoSymbolsBackRange = new vscode.Range(range.start.with({ character: range.start.character - 2 }), range.start)
				const twoSymbolsBack = document.getText(twoSymbolsBackRange).trimEnd()

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
					query = word + "\\s+: " //word with multiple spaces and semicolon and space
				}
				else {//if (twoSymbolsBack == ":") {
					query = "type " + word
				}

				if (query) {
					const declarations = vscode.commands.executeCommand("workbench.action.findInFiles", {
						query: query,
						triggerSearch: true,
						isRegex: true,
						matchWholeWord: true
					})

					declarations
						.then(() => sleep(100))
						.then(() => vscode.commands.executeCommand("search.action.focusNextSearchResult", {
							when: "hasSearchResult"
						}))

					// return declarations
					return []
				}
				return []
			}
		}
	)

	context.subscriptions.push(provider);
}
