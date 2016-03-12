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

const indentation = 2
const spaces = n => R.join('', R.repeat(' ', n))
const indent = (str) =>  spaces(indentation) + str
const pad = R.curry((n, str) => str + spaces(n - str.length))
const padprint = R.curry((n, {pattern, description}) => pad(n, pattern) + description )

const help = (spec) => {
  // determine max width of patterns
  const getPatternLength =  R.pipe(R.prop('pattern'), R.length)
  const commandLengths = R.map(getPatternLength, spec.commands)
  const optionLengths = R.chain(R.pipe(
    R.prop('options'),
    R.map(getPatternLength),
    R.map(R.add(indentation)),
  ), spec.commands)

  const maxlen = R.reduce(R.max, 0, R.concat(commandLengths, optionLengths)) + indentation

  const commandHelp = R.chain((command) => {
    return R.concat(
      [padprint(maxlen, command)],
      R.map((option) => {
        return [padprint(maxlen, R.evolve({pattern: indent}, option))]
      }, command.options)
    )
  }, spec.commands)

  const mainHelp = [
    ``,
    `${spec.name} ${spec.version}`,
    ``,
    `${spec.description}`,
    ``,
  ]

  return R.pipe(
    R.map(indent),
    R.join('\n')
  )(R.concat(mainHelp, commandHelp)) + '\n'
}

// cli :: Spec -> String|Array -> Anything
const cli = (spec) => (cmd) => {
  // cmd can be a string, in which we'll tokenize
  // and if its process.argv, then we'll remove node filename
  const args = cmdToArgs(cmd)
  // if there are no arges or a help flag, log out the help
  if (args.length === 0 || args[0] === '' || args[0] === '-h' || args[0] === '--help') {
    // XXX display help
    console.log(help(spec))
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

export default cli