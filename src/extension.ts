/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { execSync } from "child_process";

declare global {
	interface String {
		lastIndexOfRegex(regex: RegExp, fromIndex: number): number;
	}
}
String.prototype.lastIndexOfRegex = function (regex: RegExp, fromIndex: number) {
	var str = fromIndex ? this.substring(0, fromIndex) : this;
	var match = str.match(regex);
	return match ? str.lastIndexOf(match[match.length - 1]) : -1;
}

const functionPattern = (word: string) => "function " + word + "\\s*[(]" //zero or more spaces followed by opening bracket
const incompleteFunctionPattern = (partOfName: string) => "function " + "(.*?)" + partOfName

/// Search in the folder's `*.*ligo` files using `git grep`
/// @param `query` is a regexp we search for
/// @param `wordToHighlight` is the specific word we highlight after query is found
const gitGrep = (workspacePath: string, query: string): string[] => {

	// ':/*.*ligo' to search in ligo files from the top directory
	// --full-name to show paths from repo root
	const searches = execSync(`git grep --full-name --untracked -n -I -E "${query}" -- ':/*.*ligo'`, {
		cwd: workspacePath,
		encoding: 'utf8',
		maxBuffer: 50 * 1024 * 1024
	})

	if (searches) {
		console.log(searches)
		return searches.split("\n").filter((res) => res != "")
	}
	return []
}

const searchesToLocations = (workspacePath: string, searches: string[], wordToHighlight: string): vscode.Location[] => {
	const locations: vscode.Location[] = []

	for (const entry of searches) {
		const [file, line, text] = entry.split(":")

		// find a word cursor to highlight it properly
		const vscodeLine = parseInt(line) - 1
		const rangeStartColumn = text.indexOf(wordToHighlight)
		const rangeStartPos = new vscode.Position(vscodeLine, rangeStartColumn)
		const rangeEndPos = new vscode.Position(vscodeLine, rangeStartColumn + wordToHighlight.length)
		const range = new vscode.Range(rangeStartPos, rangeEndPos)

		const path = workspacePath + "/" + file
		const location: vscode.Location = new vscode.Location(vscode.Uri.parse(path), range)
		locations.push(location)
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
						const currentWorkspace = vscode.workspace.getWorkspaceFolder(document.uri)!
						const workingDir = currentWorkspace.uri.path
						const searches = gitGrep(workingDir, query)
						return searchesToLocations(workingDir, searches, word)
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
					for (const folder of vscode.workspace.workspaceFolders) {
						// const folder = vscode.workspace.getWorkspaceFolder(path.uri)!
						console.log("Looking in folder", folder.uri.path)
						console.log("Query", query)
						const searches = gitGrep(folder.uri.path, query)
						console.log("Found", searches.length)
						for (const entry of searches) {
							const [file, line, text] = entry.split(":")

							const vscodeLine = parseInt(line) - 1
							const rangeStartColumn = text.indexOf(word)
							const wordStart = text.lastIndexOfRegex(/[^A-Za-z0-9_]/g, rangeStartColumn) + 1
							const wordLength = text.substring(rangeStartColumn).search(/[^A-Za-z0-9_]/g)

							const rangeStartPos = new vscode.Position(vscodeLine, wordStart)
							const rangeEndPos = new vscode.Position(vscodeLine, rangeStartColumn + wordLength)
							const range = new vscode.Range(rangeStartPos, rangeEndPos)

							const fullName = text.substring(wordStart, rangeStartColumn + wordLength)
							console.log("full name", fullName)

							const path = folder.uri.path + "/" + file
							const location: vscode.Location = new vscode.Location(vscode.Uri.parse(path), range)
							console.log()
							const symbol = new vscode.SymbolInformation(fullName, vscode.SymbolKind.Function, "", location)
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
