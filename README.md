# Extensible JavaScript CLI

This is a highly extensible cli tool. Its much like commander.js, but its much leaner and supports recursive commands. This makes it really easy to extend the tool with custom commands.

I also used the project to become more familiar with the category theory I learned from MostlyAdequate and the result is a bulletproof program.

# Getting Started

```js
npm install --save cli # XXX not on npm yet
```

XXX

# Development

- build dist files:

        ./node_modules/.bin/babel --presets es2015,stage-0 -d ./dist ./src

- run unit tests

        ./node_modules/.bin/babel-node -s --presets es2015,stage-0 ./tests/test.js

# To Do

- better validation failure messages
- format and log validation failure messages
- better explanation of filtering --help tags
- verify process.argv handles quoted string
- fork and potentially chain returned async tasks
- documentation by example

- unit tests
- continutous integration
- code coverage

# Docs

- spec
- constraints
  - options always come at the end of a command
  - options do not carry into recursive calls
