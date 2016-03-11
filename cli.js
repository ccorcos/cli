import R from 'ramda'
import is from 'is-js'
import Validation from './validation'
const {Success, Failure} = Validation

// todo
// - better error reporting using .context
// - smaller functions, more ramda
// - trigger each error explicitly

// headEquals :: x -> [y] -> Boolean
const headEquals = R.useWith(R.equals, [R.identity, R.head])
// lastEquals :: x -> [y] -> Boolean
const lastEquals = R.useWith(R.equals, [R.identity, R.last])
// tokenize :: String -> [String]
const tokenize = R.split(' ')
// withoutNode :: [String] -> [String]
const withoutNode = R.ifElse(headEquals('node'), R.tail, R.identity)
// withoutFilename :: [String] -> [String]
const withoutFilename = R.ifElse(headEquals(__filename), R.tail, R.identity)
// justCliArgs :: [String] -> [String]
const justCliArgs = R.pipe(withoutNode, withoutFilename)
// cmdToArgs :: (String|Array x) => x -> [String]
const cmdToArgs = R.ifElse(is.string, R.pipe(tokenize, justCliArgs), justCliArgs)
// tokenIsParam :: String -> Boolean
const tokenIsParam = R.allPass([headEquals('<'), lastEquals('>')])
// tokenIsVariadic :: String -> Boolean
const tokenIsVariadic = R.pipe(R.slice(-4, -1), R.equals('...'))
// argIsOption :: String -> Boolean
const argIsOption = headEquals('-')
// getTokenName :: String -> String
const getTokenName = R.replace(/[\<\>\.]/g, '')

// Result :: {params:{}, leftover:[String]}
// mergeResults :: Result -> Result -> Result
const mergeResults = (a) => (b) => {
  // merge a and b params, but take only the b leftover args
  return {params: R.merge(a.params, b.params), leftover: b.leftover}
}

// parsePositionalTokens :: [String] -> [String] -> Validation Result
const parsePositionalTokens = (tokens, args) => {
  // given positional argument tokens and a list of arguments, parse out the params
  // and the leftover arguments.
  if (tokens.length === 0) {
    return Success.of({params: {}, leftover: args})
  } else if (args.length === 0) {
    return Failure.of([`Expected more arguments. The following tokens are missing: ${R.join(' ', tokens)}.`])
  }
  const token = R.head(tokens)
  const name = getTokenName(token)
  if (tokenIsParam(token)) {
    if (tokenIsVariadic(token)) {
      // for a variadic positional argument, slurp up all the arguments until any
      // option arguments
      const [tokenParams, leftoverArgs] = R.splitWhen(argIsOption, args)
      return Success.of({params: {[name]: tokenParams}, leftover: leftoverArgs})
    } else {
      // get the token parameter
      const [tokenParam, ...leftoverArgs] = args
      const result = Success.of({params:{[name]: tokenParam}, leftover: leftoverArgs})
      // recursively parse out the leftover of the tokens
      const others = parsePositionalTokens(R.tail(tokens), leftoverArgs)
      // join the results inside object
      return result.map(mergeResults).ap(others)
    }
  } else {
    if (name === args[0]) {
      // check that the exact token matches and recursively evaluate the leftover
      // of the tokens
      const leftoverArgs = R.tail(args)
      const result = Success.of({params:{}, leftover: leftoverArgs})
      const others = parsePositionalTokens(R.tail(tokens), leftoverArgs)
      return result.map(mergeResults).ap(others)
    } else {
      return Failure.of(['Expected a command keyword "'+name+'".'])
    }
  }
}

// parseMultiOpt :: [Option] -> String -> Validation {}
const parseMultiOpt = (options, arg) => {
  // parse the multioption tag into individual tags
  // e.g. '-abc' -> ['-a', '-b', '-c']
  const tags = R.pipe(
    R.tail,
    R.split(''),
    R.map(R.concat('-'))
  )(arg)
  // match each tag to an option
  const result = R.map((tag) => {
    const option = R.find(R.propEq('short', tag), options)
    if (!option) { return Failure.of([`Unkown boolean option "${tag}"`]) }
    // if there are positional tokens for this option, then it shouldn't be in a multioption
    if (option.tokens.length > 0) {
      return Failure.of([`Error while parsing "${arg}". Only boolean options can be used as ` +
        `a multi-option and "${option.pattern}" has positional arguments.`])
    }
    // set the option value
    return Success.of({[option.name]: true})
  }, tags)
  // we have an array of Validations that we need to turn into a Validation of an array
  // and then merge all the parameters together.
  return R.pipe(
    R.sequence(Success.of),
    R.map(R.reduce(R.merge, {})),
  )(result)
}

// argIsMultiBoolOpt :: String -> Boolean
const argIsMultiBoolOpt = R.allPass([
  argIsOption,
  R.pipe(R.nth(1), R.complement(R.equals('-'))),
  R.pipe(R.length, R.gt(R.__, 2))
])

// nestParams :: String -> {} -> Result
const nestParams = (name) => ({params, leftover}) => {
  // given the name of an option and some positional params, nest
  // the parameters in the context of the option name.
  return {params:{[name]: params}, leftover}
}

// parseSingleOpt :: Option -> [String] -> Result
const parseSingleOpt = (option, args) => {
  if (args[0] === option.short || args[0] === option.long) {
    if (option.tokens.length > 0) {
      // parse option positional tokens
      const result = parsePositionalTokens(option.tokens, R.tail(args))
        // XXX this error gets mucked -- we should break this into multiple steps
        .context(`While parsing the positional arguments for "${option.pattern}":`)
      return R.map(nestParams(option.name), result)
    } else {
      // simple boolean option
      return Success.of({params:{[option.name]: true}, leftover: R.tail(args)})
    }
  } else {
    // unknown option tag
    return Failure.of([`"${args[0]}" did not match option pattern ` +
      `"${option.short}" or "${option.long}".`])
  }
}

// Option :: {long, short, tokens, pattern, description, name}
// reformatOption :: {pattern, description} -> Option
const reformatOption = (option) => {
  const [short, long, ...tokens] = R.pipe(
    R.split(' '),
    R.map(R.replace(/,/g, ''))
  )(option.pattern)
  return {short, long, tokens, name: R.drop(2, long), ...option}
}

// Command :: {pattern, description, tokens, options: [Option]}
// reformatCommand :: {pattern, description, options} -> Command
const reformatCommand = (command) => {
  return {
    ...command,
    tokens: tokenize(command.pattern),
    options: R.map(reformatOption, command.options)
  }
}

// parseOptions :: [Option] -> [String] -> Validation Result
const parseOptions = (options, args) => {
  // if there are no args, then all options have been parsed
  if (args.length === 0) {
    return Success.of({params:{}, leftover:[]})
  }
  // check if the next argument is an option
  const next = R.head(args)
  if (argIsMultiBoolOpt(next)) {
    // parse the mutliopt and place params in the proper result format
    const multiOpt = R.map((params) => {
      return {params, leftover:  R.tail(args)}
    }, parseMultiOpt(options, next))
    // recursively parse the leftover options
    const others = parseOptions(options, R.tail(args))
    // and merge the results together
    return multiOpt.map(mergeResults).ap(others)
  } else if (argIsOption(next)) {
    // try to parse with all the options
    const attempts = R.map((option) => parseSingleOpt(option, args), options)
    const option = R.find((x) => x.isSuccess, attempts)
    if (!option) { return Failure.of([`Unknown option "${next}".`]) }
    // recursively parse the leftover of the options, merge back together
    // and flatten using .chain
    return option.chain((result) =>
      parseOptions(options, result.leftover)
        .map(mergeResults(result)))
  } else {
    // if there are no options, then pass on the leftover args
    return Success.of({params:{}, leftover:args})
  }
}

// cli :: Spec -> String|Array -> Anything
const cli = (spec) => (cmd) => {
  // cmd can be a string, in which we'll tokenize
  // and if its process.argv, then we'll remove node filename
  const args = cmdToArgs(cmd)
  // if there are no arges or a help flag, log out the help
  if (args.length === 0 || args[0] === '--help') {
    // XXX display help
    console.log(JSON.stringify(spec, null, 2))
    return
  }
  // reformat the commands and options in the spec with tokens,
  // parse long and short options, etc.
  spec = {
    ...spec,
    commands: R.map(reformatCommand, spec.commands)
  }
  // attempt parse with each command
  // XXX clean this up with ramda and smaller pure functions
  const attempts = spec.commands.map((command) => {
    // attempt to parse out position tokens
    return parsePositionalTokens(command.tokens, args)
      .chain((result) =>
        // attempt to parse out option arguments
        parseOptions(command.options, result.leftover)
          .map(mergeResults(result)))
      // if all went well, then lets run the action
      .chain(({params, leftover}) => {
         const value = command.action(params)
        // if the action returns a function, then lets run
        // that function with the leftover of the args
        if (is.fn(value)) {
          return value(leftover)
        } else if (leftover.length > 0) {
          return Failure.of(['Leftover arguments: '+R.join(' ', leftover)])
        } else {
          // XXX this could be a value or a
          return Validation.coerse(value)
        }
      })
    })

  const result = R.find((x) => x.isSuccess, attempts)
  if (result) {
    return result
  } else {
    // XXX throw / print out failure
    return attempts
  }
}

const log = console.log.bind(console)


// constrains:
// options always come at the end of a command
// options do not carry into recursive calls

const options = [{
  pattern: '-b, --boolean',
  description: 'boolean option example'
}, {
  pattern: '-t, --true',
  description: 'another boolean example'
}, {
  pattern: '-f, --false',
  description: 'another boolean example'
}, {
  pattern: '-a, --arg <arg>',
  description: 'positional arg example'
}, {
  pattern: '-s, --args <foo> <bar>',
  description: 'positional arg example'
}, {
  pattern: '-l, --list <list...>',
  description: 'variadic arg example'
}, {
  pattern: '-z, --zoop <zoop> <zoops...>',
  description: 'positional and variadic example'
}]

const main = {
  name: 'main',
  commands: [{
    pattern: 'position <pos>',
    description: 'positional command example',
    options: options,
    action: R.identity
  }, {
    pattern: 'positions <beep> <boop>',
    description: 'multpile positional command example',
    options: options,
    action: R.identity
  }, {
    pattern: 'variadic <files...>',
    description: 'variadic command example',
    options: options,
    action: R.identity
  }, {
    pattern: 'posvar <pvar> <vvar...>',
    description: 'positional and variadic command example',
    options: options,
    action: R.identity
  }, {
    pattern: 'recur <loop>',
    description: 'recursive command',
    options: options,
    action: (params) => {
      return R.map(R.map(R.merge(params)), cli(main))
    }
  }]
}

const tests = [{
    input: 'position x',
    output: {pos: 'x'}
  }, {
    input: 'position x -b',
    output: {pos: 'x', boolean: true}
  }, {
    input: 'position x -btf',
    output: {pos: 'x', boolean: true, true: true, false: true}
  }, {
    input: 'position x -a 10',
    output: {pos: 'x', arg: {arg: '10'}}
  }, {
    input: 'position x -s 10 abc',
    output: {pos: 'x', args: {foo: '10', bar: 'abc'}}
  }, {
    input: 'position x -l 1 2 3 4 5 6',
    output: {pos: 'x', list: {list: ['1', '2', '3', '4', '5', '6']}}
  }, {
    input: 'position x -z a b',
    output: {pos: 'x', zoop: {zoop: 'a', zoops: ['b']}},
  }, {
    input: 'position x -a a -z a b',
    output: {pos: 'x', arg: {arg: 'a'}, zoop: {zoop: 'a', zoops: ['b']}}
  }, {
    input: 'positions x y',
    output: {beep: 'x', boop: 'y'}
  }, {
    input: 'positions x y -bf --true',
    output: {beep: 'x', boop: 'y', boolean: true, true: true, false: true}
  }, {
    input: 'positions x y --arg 10',
    output: {beep: 'x', boop: 'y', arg: {arg: '10'}}
  }, {
    input: 'variadic x y z',
    output: {files: ['x', 'y', 'z']}
  }, {
    input: 'variadic x -l 10',
    output: {files: ['x'], list: {list: ['10']}}
  }, {
    input: 'posvar 1 2 3',
    output: {pvar: '1', vvar: ['2', '3']}
  }, {
    input: 'posvar 1 2 3 --zoop 4 5 6',
    output: {pvar: '1', vvar: ['2', '3'], zoop: {zoop: '4', zoops: ['5', '6']}}
  }, {
    input: 'recur 66 -l 1 2 3 --true posvar 1 2 3 --zoop 4 5 6',
    output: {loop: '66', list: {list: ['1', '2', '3']}, true: true, pvar: '1', vvar: ['2', '3'], zoop: {zoop: '4', zoops: ['5', '6']}}
  }]

// log(('positions x y -btf'))

const f = cli(main)
tests.forEach(({input, output}) => {
  const result = f(input).value
  if (!R.equals(result, output)) {
    log(result, output)
  }
})



// log(R.sequence(Success.of, [Success.of(10), Success.of(21)]))
// log(R.sequence(Success.of, [Success.of(10), Failure.of([1])]))
// log(R.sequence(Success.of, [Failure.of([2]), Failure.of([1])]))
