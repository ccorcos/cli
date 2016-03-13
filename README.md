# Extensible JavaScript CLI

This is a highly extensible cli tool. Its much like commander.js, but its much leaner and supports recursive commands. This makes it really easy to extend the tool with custom commands.

I also used the project to become more familiar with the category theory I learned from MostlyAdequate and the result is a bulletproof program.

# Getting Started

```js
npm install --save cli # XXX not on npm yet
```

### Basics

You define commands using patterns. Perhaps its best to learn by example. Each program has a name, description, version, and an array of commands. Each command has a pattern, description, action, and an array of options. Each option has a pattern and a description.

The command pattern is for positional arguments. These can be keywords, positional parameters and variadic parameters (variadic meaning multiple inputs).

```js
import cli from 'cli'

const order = cli({
  name: 'order',
  description: 'order food from your commandline!',
  version: '0.0.1',
  commands: [{
    pattern: 'pizza <size>',
    description: 'order a pizza from your local pizza shop',
    options: [{
      pattern: '-p, --peperoni',
      description: 'add peperoni topping',
    }],
    action({size, peperoni}) {
      return `ordered a ${size} pizza${peperoni ? ' with peperoni.' : '.'}`
    }
  }
})
```

In this example, `pizza` is a keyword positional arguement, `size` is a positional parameter, and `peperoni` is a boolean option. The action will typically just `console.log` but you can also return the value so you can use this cli from other node apps without having to go through bash.

Here are some things you can do with this:

```js
order('pizza large')
order('pizza large -p')
order('pizza large --peperoni')
// parse commandline arguments
order(process.argv)
```

One constraint is that the optional arguments must come after the positional arguments. There are no optional positional arguments.

### Nifty Features

Positional arguments can have variadic inputs. For example you could have a command like this:

```js
commands: [{
pattern: 'pizza <size> <toppings...>',
description: 'order a pizza from your local pizza shop',
action({size, toppings}) {
  return `ordered a ${size} pizza with toppings: #{toppings.join(', ')}`
}
```

But in this case, you must include at least one topping. You might not like that though. So another feature is that you can include positional arguments in your option patterns.

```js
commands: [{
pattern: 'pizza <size>',
description: 'order a pizza from your local pizza shop',
options: [{
  pattern: '-t, --toppings <list...>',
  description: 'toppings',
}],
action({size, toppings}) {
  const list = toppings && toppings.list
  const str = list ? ` with toppings: ${toppings.join(', ')` : '.'
  return `ordered a ${size} pizza` + str
}
```

So now you can order pizza like this:

```js
order('pizza small --toppings peperoni sausage olives')
```

And again, if you use `order(process.argv)` and `chmod +x` your script, you can use it from the commandline:

```sh
./order pizza small --toppings peperoni
```

When you have multiple boolean options (options without positional arguments), you can bundle them together as well. For for example, if you had the following options:

```js
options: [{
  pattern: '-p, --peperoni',
  description: 'add peperoni topping',
}, {
  pattern: '-o, --olive',
  description: 'add olive topping',
}]
```

You could specify perperoni and olive using `-po`.

### Extensibility

The last feature to mention is that if you return a function from an action, that function will get called with the rest of the arguments that are left. This way, you can extend your tool by simply requiring other cli programs. For example, check out this command:

```js
{
  pattern: '<service>',
  description: 'order from 3rd party services',
  action({service}) {
    return services[service]
}
```

If you had an object of 3rd party services where the values are just more cli programs, then you have a very easily extensible program with nested scope.

You can validate inside the action as well, and return a `Validation.Failure` if anything is wrong. For example:

```js
action({service}) {
  const next = services[service]
  return next ? next : Validation.Failure.of([`Unknown service "${service}".`])
}
```

### Help

Calling the program with no arguments or with -h or --help will print out a help menu. For example:

```sh

  order 0.0.1

  order food from your commandline!

  pizza <size>      order a pizza from your local pizza shop
    -p, --peperoni  add peperoni topping

```

### Async Tasks



# Development

- build dist files:

        ./node_modules/.bin/babel --presets es2015,stage-0 -d ./dist ./src

- run unit tests

        ./node_modules/.bin/babel-node -s --presets es2015,stage-0 ./tests/test.js

# To Do

./node_modules/.bin/babel-node -s --presets es2015,stage-0 ./examples/order.js

- async Task using inquirer / async fetch
- webpack build dist file
- unit tests, async, failure messages (with minimal examples)

- documentation by example, unit tests with example

- unit tests
- continutous integration
- code coverage

