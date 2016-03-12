the goal here is to learn some functional programming along the way

todo:
- make my own custom validation data structure
- support for async tasks to be returned



build dist files:

    ./node_modules/.bin/babel --presets es2015,stage-0 -d ./dist ./src

run unit tests

    ./node_modules/.bin/babel-node -s --presets es2015,stage-0 ./tests/test.js



# To Do

- log format validation failures
- better validation failure messages

- unit tests
- continutous integration
- code coverage


# Docs

- spec
- constraints
  - options always come at the end of a command
  - options do not carry into recursive calls
