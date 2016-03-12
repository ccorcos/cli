import R from 'ramda'
import is from 'is-js'
import Validation from './validation'
const {Success, Failure} = Validation

// headEquals :: x -> [y] -> Boolean
const headEquals = R.useWith(R.equals, [R.identity, R.head])
// lastEquals :: x -> [y] -> Boolean
const lastEquals = R.useWith(R.equals, [R.identity, R.last])
// tokenize :: String -> [String]
const tokenize = R.split(' ')
// justCliArgs :: [String] -> [String]
const justCliArgs = R.ifElse(headEquals('node'), R.drop(2), R.identity)
// cmdToArgs :: (String|Array x) => x -> [String]
const cmdToArgs = R.ifElse(is.string, R.pipe(tokenize, justCliArgs), justCliArgs)
// tokenIsParam :: String -> Boolean
const tokenIsParam = R.allPass([headEquals('<'), lastEquals('>')])
// tokenIsVariadic :: String -> Boolean
const tokenIsVariadic = R.pipe(R.slice(-4, -1), R.equals('...'))
// argIsHelpOption :: String -> Boolean
const argIsHelpOption = R.anyPass([R.equals('--help'), R.equals('-h'), R.equals('')])
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

// given positional argument tokens and a list of arguments, recursively
// parse out the params and the leftover arguments.
// parsePositionalTokens :: [String] -> [String] -> Validation Result
const parsePositionalTokens = (tokens, args) => {
  if (tokens.length === 0) {
    return Success.of({params: {}, leftover: args})
  } else if (args.length === 0) {
    return Failure.of([`Expected more arguments. The following tokens are missing: "${R.join(' ', tokens)}".`])
  }
  const token = R.head(tokens)
  const name = getTokenName(token)
  if (argIsOption(args[0])) {
    return Failure.of([`Expected token "${token}", recieved an option "${args[0]}".`])
  } else if (tokenIsParam(token)) {
    if (tokenIsVariadic(token)) {
      // for a variadic positional argument, slurp up all the arguments
      // until any option arguments
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
      // check that the exact token matches and recursively evaluate
      // the leftover of the tokens
      const leftoverArgs = R.tail(args)
      const result = Success.of({params:{}, leftover: leftoverArgs})
      const others = parsePositionalTokens(R.tail(tokens), leftoverArgs)
      return result.map(mergeResults).ap(others)
    } else {
      return Failure.of([`Expected a command keyword "${name}". Recieved "${args[0]}".`])
    }
  }
}

// parseMultiOpt :: [Option] -> String -> Validation {}
const parseMultiOpt = (options, arg) => {
  // first, parse the multi-option tag into individual tags
  // e.g. '-abc' -> ['-a', '-b', '-c']
  const tags = R.pipe(R.tail, R.split(''), R.map(R.concat('-')))(arg)
  // match each tag the correct option spec
  const result = tags.map((tag) => {
    const option = R.find(R.propEq('short', tag), options)
    if (!option) { return Failure.of([`Unknown boolean option "${tag}"`]) }
    // if there are positional tokens for this option, then it shouldn't
    // be in a multi-option
    if (option.tokens.length > 0) {
      return Failure.of([`Only boolean options can be used as ` +
        `a multi-option and "${option.pattern}" has positional arguments ` +
        `(referring to "${arg}").`])
    }
    // set the option value which we'll merge together with the rest later
    return Success.of({[option.name]: true})
  })
  // we have an array of Validations that we need to turn into a Validation
  // of an array and then merge all the parameters together.
  return R.pipe(
    R.sequence(Success.of),
    R.map(R.reduce(R.merge, {}))
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
        .context(`While parsing the positional arguments for option "${option.pattern}"`)
      return R.map(nestParams(option.name), result)
    } else {
      // simple boolean option
      return Success.of({params:{[option.name]: true}, leftover: R.tail(args)})
    }
  } else {
    // mismatched option tag
    return Failure.of([])
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
    if (options.length === 0) { return Failure.of([`Unknown option "${next}".`]) }
    // parse the mutli-option
    const multiOpt = parseMultiOpt(options, next)
      // place params in the proper result format
      .map((params) => ({params, leftover:  R.tail(args)}))
    // recursively parse the leftover options
    const others = parseOptions(options, R.tail(args))
    // and merge the results together
    return multiOpt.map(mergeResults).ap(others)
  } else if (argIsOption(next) && !argIsHelpOption(next)) {
    // if theres a help option left over, it might be for a nested command
    if (options.length === 0) { return Failure.of([`Unknown option "${next}".`]) }
    // try to parse with all the options
    const attempts = R.map((option) => parseSingleOpt(option, args), options)
    const option = R.find((x) => x.isSuccess, attempts)
    if (!option) { return R.sequence(Success.of, attempts.concat(Failure.of([`Could not parse option "${next}".`]))) }
    // recursively parse the leftover of the options and merge back together
    return option.chain((result) =>
      parseOptions(options, result.leftover)
        .map(mergeResults(result)))
  } else {
    // if there are no options, then pass on the leftover args
    return Success.of({params:{}, leftover:args})
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

// reformat spec to the parsed patterns
// reformatSpec :: {} -> {}
const reformatSpec = (spec) => {
  return {...spec, commands: R.map(reformatCommand, spec.commands)}
}

// parseArgsWithCommand :: [String] -> Command -> Validation x
const parseArgsWithCommand = (args) => (command) =>
  // attempt to parse out position tokens
  parsePositionalTokens(command.tokens, args)
    .context(`While parsing positional arguments for "${command.pattern}"`)
    // attempt to parse out option arguments
    .chain((result) =>
      parseOptions(command.options, result.leftover)
        .context(`While parsing options for "${command.pattern}"`)
        // merge results with positional results
        .map(mergeResults(result)))
    // if all went well, then lets run the action
    .chain(({params, leftover}) => {
       const value = command.action(params)
      if (is.fn(value)) {
        // recursively call function with leftover arguments
        return value(leftover)
      } else if (leftover.length > 0) {
        return Failure.of(['Leftover arguments: '+R.join(' ', leftover)])
          .context(`While parsing with "${command.pattern}"`)
      } else if (value && value.isFailure) {
        // custom validation in action can return a failure
        return value
      } else {
        return Success.of(value)
      }
    })

const indentation = 2
// spaces :: Number -> String
const spaces = n => R.join('', R.repeat(' ', n))
// indent :: String -> String
const indent = (str) =>  spaces(indentation) + str
// pad :: Number -> String -> String
const pad = R.curry((n, str) => str + spaces(n - str.length))
// formatln :: Number -> {} -> String
const formatln = R.curry((n, {pattern, description}) => pad(n, pattern) + description)

// help :: Spec -> String
const help = (spec) => {
  // determine max width of the command patterns and the indented
  // options patterns
  const getPatternLength =  R.pipe(R.prop('pattern'), R.length)
  const commandLengths = R.map(getPatternLength, spec.commands)
  const optionLengths = R.chain(R.pipe(
    R.prop('options'),
    R.map(getPatternLength),
    R.map(R.add(indentation)),
  ), spec.commands)
  // determine the max length pattern
  const maxlen = R.reduce(R.max, 0, R.concat(commandLengths, optionLengths))
  // indent the descriptions from the max length
  const padlen = maxlen + indentation
  // format the pattern-description lines for all commands and their options
  const commandHelpLines = R.chain((command) => R.concat(
    // the command help line
    [ formatln(padlen, command) ],
    // format all the command option lines
    command.options.map((option) =>
      // indent the pattern before padding
      [formatln(padlen, R.evolve({pattern: indent}, option))]
    )
  ), spec.commands)
  // format the program heading
  const mainHelpLines = [
    ``,
    `${spec.name} ${spec.version}`,
    ``,
    `${spec.description}`,
    ``,
  ]
  // indent everything and join lines
  return R.pipe(
    R.map(indent),
    R.join('\n')
  )(R.concat(mainHelpLines, commandHelpLines)) + '\n'
}

const formatError = R.pipe(
  R.map(item => {
    if (is.array(item)) {
      return R.pipe(
        formatError,
        R.split('\n'),
        R.map(indent),
        R.join('\n')
      )(item)
    } else {
      return indent(item)
    }
  }),
  R.join('\n')
)

// input cmd can be a string, in which we'll tokenize
// and if its process.argv, then we'll remove node filename
// cli :: Spec -> String|Array -> Validation x
const cli = R.pipe(reformatSpec, (spec) => R.pipe(cmdToArgs, (args) => {
  // if there are no args or there is a help flag, return help
  if (args.length === 0 || argIsHelpOption(args[0])) {
    return Success.of(help(spec))
  }
  // attempt parse with each command
  const attempts = R.map(parseArgsWithCommand(args), spec.commands)
  const result = R.find((x) => x.isSuccess, attempts)
  // typically, you'll just console.log from a command-line application
  // but you can also use it to return a result
  if (result) {
    return result
  } else {
    throw new Error('\n' + formatError(R.sequence(Failure.of, attempts).value) + '\n')
    return
  }
}))

export default cli