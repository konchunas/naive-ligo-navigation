# Navigate Pascal Ligo projects by naive searches using `git grep`

Implements "Go to definition" for Pascal Ligo dialect of Tezos smart contract language

+ Makes strong assumptions on your project code formatting
+ Requires workspace folder to be checked into git
+ Loads and navigates in few milliseconds as opposed to fully-fledged Language servers
+ Doesn't build AST, often misses and yields false positives
+ Might require pascaligo-vscode package to identify `ligo` language