import R from 'ramda'
import is from 'is-js'
import Validation from 'data.validation'

// todo
// - make my own validation type
//   - nested error messages
//   - chainable using result merge

// fixing a little bug
Validation.of = function(x) {
  return Validation.Success(x)
}

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

// Result :: {params:{}, rest:[String], command:Command}
// mergeResults :: Result -> Result -> Result
const mergeResults = (a) => (b) => {
  // merge a and b params, but take only the b rest args
  return {...a, ...b, params: R.merge(a.params, b.params), rest: b.rest}
}

// parsePositionalTokens :: [String] -> [String] -> Validation Result
const parsePositionalTokens = (tokens, args) => {
  // given positional argument tokens and a list of arguments, parse out the params
  // and the leftover arguments.
  if (tokens.length === 0) {
    return Validation.Success({params: {}, rest: args})
  } else if (args.length === 0) {
    return Validation.Failure(['Not enough arguments. Expected the following tokens: '
      + R.join(' ', tokens)])
  }
  const token = R.head(tokens)
  const name = getTokenName(token)
  if (tokenIsParam(token)) {
    if (tokenIsVariadic(token)) {
      // for a variadic positional argument, slurp up all the arguments until any
      // option arguments
      const [tokenParams, restArgs] = R.splitWhen(argIsOption, args)
      return Validation.Success({params: {[name]: tokenParams}, rest: restArgs})
    } else {
      // get the token parameter
      const [tokenParam, ...restArgs] = args
      const result = Validation.Success({params:{[name]: tokenParam}, rest: restArgs})
      // recursively parse out the rest of the tokens
      const others = parsePositionalTokens(R.tail(tokens), restArgs)
      // join the results inside Validation object
      return R.pipe(
        R.map(mergeResults),
        R.ap(R.__, others)
      )(result)
    }
  } else {
    if (name === args[0]) {
      // check that the exact token matches and recursively evaluate the rest
      // of the tokens
      const restArgs = R.tail(args)
      const result = Validation.Success({params:{}, rest: restArgs})
      const others = parsePositionalTokens(R.tail(tokens), restArgs)
      return R.pipe(
        R.map(mergeResults),
        R.ap(R.__, others)
      )(result)
    } else {
      // the arguments dont match this command's tokens
      return Validation.Failure('Expected a command keyword "'+name+'"')
    }
  }
}

// parseMultiOpt :: [Option] -> String -> Validation {}
const parseMultiOpt = (options, arg) => {
  // parse the multioption tag into individual tags
  // '-abc' -> ['-a', '-b', '-c']
  const tags = R.pipe(
    R.tail,
    R.split(''),
    R.map(R.concat('-'))
  )(arg)
  // match each tag to an option
  const result = R.map((tag) => {
    const option = R.find(R.propEq('short', tag), options)
    if (!option) { return Validation.Failure(['Unkown boolean option "'+tag+'"']) }
    // if there are positional tokens for this option, then it shouldn't be in a multioption
    if (option.tokens.length > 0) {
      return Validation.Failure(['Only boolean options can be bundles together in a multi-option and "'
        +tag+' '+option.tokens.join(' ')+'" is not a boolean option. This error occured while parsing "'
        +arg+'".'])
    }
    // set the option value
    return Validation.Success({[option.name]: true})
  }, tags)
  // we need to turn [Validation] into Validation []
  // and then merge all the parameters together into Validation {}
  return R.pipe(
    R.sequence(Validation.of),
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
const nestParams = (name) => ({params, rest}) => {
  // given the name of an option and some positional params, nest
  // the parameters in the context of the option name.
  return {params:{[name]: params}, rest}
}

// parseSingleOpt :: Option -> [String] -> Validation Result
const parseSingleOpt = (option, args) => {
  if (args[0] === option.short || args[0] === option.long) {
    if (option.tokens.length > 0) {
      // parse option positional tokens
      const result = parsePositionalTokens(option.tokens, R.tail(args))
      return R.map(nestParams(option.name), result)
    } else {
      // simple boolean option
      return Validation.Success({params:{[option.name]: true}, rest: R.tail(args)})
    }
  } else {
    // unknown option tag
    return Validation.Failure(['Expected option tag, either "'+option.short
      +'" or "'+option.long+'" but got "'+args[0]+'"'])
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
    return Validation.Success({params:{}, rest:[]})
  }
  // check if the next argument is an option
  const next = R.head(args)
  if (argIsMultiBoolOpt(next)) {
    const multiOpt = R.map((params) => {
      return {params, rest:  R.tail(args)}
    }, parseMultiOpt(options, next))
    // recursively parse the rest of the options
    const others = parseOptions(options, R.tail(args))
    // and merge the results together
    return R.pipe(
      R.map(mergeResults),
      R.ap(R.__, others)
    )(multiOpt)
  } else if (argIsOption(next)) {
    // try to parse with all the options
    const attempts = R.map((option) => parseSingleOpt(option, args), options)
    const option = R.find((x) => x.isSuccess, attempts)
    if (!option) { return Validation.Failure(['Unknown option "'+next+'"']) }
    // recursively parse the rest of the options
    // XXX it would be awesome if there was some kind of custom chain we could do...
    const others = parseOptions(options, option.value.rest)
    // merge the results together
    return R.pipe(
      R.map(mergeResults),
      R.ap(R.__, others)
    )(option)
  } else {
    // if there are no options, then pass it on
    return Validation.Success({params:{}, rest:args})
  }
}

// cli :: Spec -> String|Array -> Anything
const cli = (spec) => (cmd) => {
  // cmd can be a string, in which we'll tokenize
  // and if its process.argv, then we'll remove node filename
  const args = cmdToArgs(cmd)
  // if there are no arges or a help flag, log out the help
  if (args.length === 0 || args[0] === '--help') {
    // display help
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
  const attempts = R.map((command) => {
    // attempt to parse out position tokens
    const posResult = parsePositionalTokens(command.tokens, args)
    if (posResult.isFailure) { return posResult }
    // attempt to parse out option arguments
    const optResult = parseOptions(command.options, posResult.value.rest)
    // merge the results together
    const result = R.pipe(
      R.map(mergeResults),
      R.ap(R.__, optResult)
    )(posResult)
    // if all went well, then lets run the action
    return R.map(({params, rest}) => {
      const value = command.action(params)
      // if the action returns a function, then lets run
      // that function with the rest of the args
      if (is.fn(value)) {
        return value(rest)
      } else if (rest.length > 0) {
        return Validation.Failure(['Leftover arguments: '+R.join(' ', rest)])
      } else {
        // XXX this could be a value or a Validation!
        return value
      }
    }, result)
  }, spec.commands)

  const result = R.find((x) => x.isSuccess, attempts)
  if (result) {
    return result
  } else {
    return Validation.Failure(['No valid commands'])
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
