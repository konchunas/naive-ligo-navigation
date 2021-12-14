/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { execSync } from "child_process";

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

const functionPattern = (word: string) => "function " + word + "\\s*[(]" //zero or more spaces followed by opening bracket
const incompleteFunctionPattern = (word: string) => "function " + word

/// Search in the folder's `*.*ligo` files using `git grep`
/// @param `query` is a regexp we search for
/// @param `wordToHighlight` is the specific word we highlight after query is found
const gitGrep = (workingDir: vscode.WorkspaceFolder, query: string, wordToHighlight: string) => {
	const locations: vscode.Location[] = []

	// ':/*.*ligo' to search in ligo files from the top directory
	// --full-name to show paths from repo root
	const searches = execSync(`git grep --full-name --untracked -n -I -E "${query}" -- ':/*.*ligo'`, {
		cwd: workingDir.uri.path,
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
			const rangeStartColumn = text.indexOf(wordToHighlight)
			const rangeStartPos = new vscode.Position(vscodeLine, rangeStartColumn)
			const rangeEndPos = new vscode.Position(vscodeLine, rangeStartColumn + wordToHighlight.length)
			const range = new vscode.Range(rangeStartPos, rangeEndPos)

			const path = workingDir.uri.path + "/" + file
			const location: vscode.Location = new vscode.Location(vscode.Uri.parse(path), range)
			locations.push(location)
		}
	}
	return locations
}


export function activate(context: vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders == undefined) { return } //only works for workspaces

	const definitionProvider = vscode.languages.registerDefinitionProvider(
		'ligo',
		{
			provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {

				const range: vscode.Range = document.getWordRangeAtPosition(position)!
				const word = document.getText(range)
				const line = document.lineAt(position).text

				const nextSymbolRange = new vscode.Range(range.end, range.end.with({ character: range.end.character + 1 }))
				const nextSymbol = document.getText(nextSymbolRange)

				const prevSymbolRange = new vscode.Range(range.start.with({ character: range.start.character - 1 }), range.start)
				const prevSymbol = document.getText(prevSymbolRange)

				const isFirstLetterUppercase = word[0].toUpperCase() == word[0]

				const isInDoubleQuotes = prevSymbol == '"' && nextSymbol == '"'

				let query = null
				if (nextSymbol == "(") {
					if (isFirstLetterUppercase) {
						query = "[|]\\s+" + word // pipe and then multiple spaces and the word
					} else {
						query = functionPattern(word)
					}
				}
				else if (prevSymbol == ".") {
					query = " " + word + "\\s+: " //word with multiple spaces and semicolon and space
				}
				else if (prevSymbol == "%") {
					query = functionPattern(word)
				}
				else if (isInDoubleQuotes) {
					if (line.includes("call_view")) {
						query = "\\[@view\\]" + "\\s+" //[@view] tag with multiple spaces
						query += functionPattern(word)	//followed by a function matcher
					}
				}
				else {
					query = "type " + word + " "
				}


				if (query) {
					if (vscode.workspace.workspaceFolders !== undefined) {
						const workingDir = vscode.workspace.getWorkspaceFolder(document.uri)!
						return gitGrep(workingDir, query, word)
					}
				}
				return null
			}
		}
	)

	const workspaceSymbolProvider = vscode.languages.registerWorkspaceSymbolProvider(
		{
			provideWorkspaceSymbols(word: string, token: vscode.CancellationToken) {
				const symbols: vscode.SymbolInformation[] = [];
				const query = incompleteFunctionPattern(word)
				if (vscode.workspace.workspaceFolders !== undefined) {
					for (const path of vscode.workspace.workspaceFolders) {
						const folder = vscode.workspace.getWorkspaceFolder(path.uri)!
						console.log("Looking in folders", folder)
						console.log("Query", query)
						const locations = gitGrep(folder, query, word)
						console.log(locations)
						for (const location of locations) {
							const symbol = new vscode.SymbolInformation(word, vscode.SymbolKind.Function, "here", location)
							symbols.push(symbol)
						}
					}
				}
				return symbols
			}
		}
	)

	context.subscriptions.push(definitionProvider);
	context.subscriptions.push(workspaceSymbolProvider);
}
