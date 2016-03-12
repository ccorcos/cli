'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _ramda = require('ramda');

var _ramda2 = _interopRequireDefault(_ramda);

var _isJs = require('is-js');

var _isJs2 = _interopRequireDefault(_isJs);

var _validation = require('./validation');

var _validation2 = _interopRequireDefault(_validation);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toArray(arr) { return Array.isArray(arr) ? arr : Array.from(arr); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var Success = _validation2.default.Success;
var Failure = _validation2.default.Failure;

// todo
// - nodeunit tests
// - generate docs like sanctuary does
// - istanbul code coverage?
// - test error reporting
// - better error reporting using .context
// - smaller functions, more ramda
// - trigger each error explicitly
// - generate help
// - log format validation failures

// headEquals :: x -> [y] -> Boolean

var headEquals = _ramda2.default.useWith(_ramda2.default.equals, [_ramda2.default.identity, _ramda2.default.head]);
// lastEquals :: x -> [y] -> Boolean
var lastEquals = _ramda2.default.useWith(_ramda2.default.equals, [_ramda2.default.identity, _ramda2.default.last]);
// tokenize :: String -> [String]
var tokenize = _ramda2.default.split(' ');
// withoutNode :: [String] -> [String]
var withoutNode = _ramda2.default.ifElse(headEquals('node'), _ramda2.default.tail, _ramda2.default.identity);
// withoutFilename :: [String] -> [String]
var withoutFilename = _ramda2.default.ifElse(headEquals(__filename), _ramda2.default.tail, _ramda2.default.identity);
// justCliArgs :: [String] -> [String]
var justCliArgs = _ramda2.default.pipe(withoutNode, withoutFilename);
// cmdToArgs :: (String|Array x) => x -> [String]
var cmdToArgs = _ramda2.default.ifElse(_isJs2.default.string, _ramda2.default.pipe(tokenize, justCliArgs), justCliArgs);
// tokenIsParam :: String -> Boolean
var tokenIsParam = _ramda2.default.allPass([headEquals('<'), lastEquals('>')]);
// tokenIsVariadic :: String -> Boolean
var tokenIsVariadic = _ramda2.default.pipe(_ramda2.default.slice(-4, -1), _ramda2.default.equals('...'));
// argIsOption :: String -> Boolean
var argIsOption = headEquals('-');
// getTokenName :: String -> String
var getTokenName = _ramda2.default.replace(/[\<\>\.]/g, '');

// Result :: {params:{}, leftover:[String]}
// mergeResults :: Result -> Result -> Result
var mergeResults = function mergeResults(a) {
  return function (b) {
    // merge a and b params, but take only the b leftover args
    return { params: _ramda2.default.merge(a.params, b.params), leftover: b.leftover };
  };
};

// parsePositionalTokens :: [String] -> [String] -> Validation Result
var parsePositionalTokens = function parsePositionalTokens(tokens, args) {
  // given positional argument tokens and a list of arguments, parse out the params
  // and the leftover arguments.
  if (tokens.length === 0) {
    return Success.of({ params: {}, leftover: args });
  } else if (args.length === 0) {
    return Failure.of(['Expected more arguments. The following tokens are missing: ' + _ramda2.default.join(' ', tokens) + '.']);
  }
  var token = _ramda2.default.head(tokens);
  var name = getTokenName(token);
  if (tokenIsParam(token)) {
    if (tokenIsVariadic(token)) {
      // for a variadic positional argument, slurp up all the arguments until any
      // option arguments

      var _R$splitWhen = _ramda2.default.splitWhen(argIsOption, args);

      var _R$splitWhen2 = _slicedToArray(_R$splitWhen, 2);

      var tokenParams = _R$splitWhen2[0];
      var leftoverArgs = _R$splitWhen2[1];

      return Success.of({ params: _defineProperty({}, name, tokenParams), leftover: leftoverArgs });
    } else {
      // get the token parameter

      var _args = _toArray(args);

      var tokenParam = _args[0];

      var _leftoverArgs = _args.slice(1);

      var result = Success.of({ params: _defineProperty({}, name, tokenParam), leftover: _leftoverArgs });
      // recursively parse out the leftover of the tokens
      var others = parsePositionalTokens(_ramda2.default.tail(tokens), _leftoverArgs);
      // join the results inside object
      return result.map(mergeResults).ap(others);
    }
  } else {
    if (name === args[0]) {
      // check that the exact token matches and recursively evaluate the leftover
      // of the tokens
      var _leftoverArgs2 = _ramda2.default.tail(args);
      var _result = Success.of({ params: {}, leftover: _leftoverArgs2 });
      var _others = parsePositionalTokens(_ramda2.default.tail(tokens), _leftoverArgs2);
      return _result.map(mergeResults).ap(_others);
    } else {
      return Failure.of(['Expected a command keyword "' + name + '".']);
    }
  }
};

// parseMultiOpt :: [Option] -> String -> Validation {}
var parseMultiOpt = function parseMultiOpt(options, arg) {
  // parse the multioption tag into individual tags
  // e.g. '-abc' -> ['-a', '-b', '-c']
  var tags = _ramda2.default.pipe(_ramda2.default.tail, _ramda2.default.split(''), _ramda2.default.map(_ramda2.default.concat('-')))(arg);
  // match each tag to an option
  var result = _ramda2.default.map(function (tag) {
    var option = _ramda2.default.find(_ramda2.default.propEq('short', tag), options);
    if (!option) {
      return Failure.of(['Unkown boolean option "' + tag + '"']);
    }
    // if there are positional tokens for this option, then it shouldn't be in a multioption
    if (option.tokens.length > 0) {
      return Failure.of(['Error while parsing "' + arg + '". Only boolean options can be used as ' + ('a multi-option and "' + option.pattern + '" has positional arguments.')]);
    }
    // set the option value
    return Success.of(_defineProperty({}, option.name, true));
  }, tags);
  // we have an array of Validations that we need to turn into a Validation of an array
  // and then merge all the parameters together.
  return _ramda2.default.pipe(_ramda2.default.sequence(Success.of), _ramda2.default.map(_ramda2.default.reduce(_ramda2.default.merge, {})))(result);
};

// argIsMultiBoolOpt :: String -> Boolean
var argIsMultiBoolOpt = _ramda2.default.allPass([argIsOption, _ramda2.default.pipe(_ramda2.default.nth(1), _ramda2.default.complement(_ramda2.default.equals('-'))), _ramda2.default.pipe(_ramda2.default.length, _ramda2.default.gt(_ramda2.default.__, 2))]);

// nestParams :: String -> {} -> Result
var nestParams = function nestParams(name) {
  return function (_ref) {
    var params = _ref.params;
    var leftover = _ref.leftover;

    // given the name of an option and some positional params, nest
    // the parameters in the context of the option name.
    return { params: _defineProperty({}, name, params), leftover: leftover };
  };
};

// parseSingleOpt :: Option -> [String] -> Result
var parseSingleOpt = function parseSingleOpt(option, args) {
  if (args[0] === option.short || args[0] === option.long) {
    if (option.tokens.length > 0) {
      // parse option positional tokens
      var result = parsePositionalTokens(option.tokens, _ramda2.default.tail(args))
      // XXX this error gets mucked -- we should break this into multiple steps
      .context('While parsing the positional arguments for "' + option.pattern + '":');
      return _ramda2.default.map(nestParams(option.name), result);
    } else {
      // simple boolean option
      return Success.of({ params: _defineProperty({}, option.name, true), leftover: _ramda2.default.tail(args) });
    }
  } else {
    // unknown option tag
    return Failure.of(['"' + args[0] + '" did not match option pattern ' + ('"' + option.short + '" or "' + option.long + '".')]);
  }
};

// Option :: {long, short, tokens, pattern, description, name}
// reformatOption :: {pattern, description} -> Option
var reformatOption = function reformatOption(option) {
  var _R$pipe = _ramda2.default.pipe(_ramda2.default.split(' '), _ramda2.default.map(_ramda2.default.replace(/,/g, '')))(option.pattern);

  var _R$pipe2 = _toArray(_R$pipe);

  var short = _R$pipe2[0];
  var long = _R$pipe2[1];

  var tokens = _R$pipe2.slice(2);

  return _extends({ short: short, long: long, tokens: tokens, name: _ramda2.default.drop(2, long) }, option);
};

// Command :: {pattern, description, tokens, options: [Option]}
// reformatCommand :: {pattern, description, options} -> Command
var reformatCommand = function reformatCommand(command) {
  return _extends({}, command, {
    tokens: tokenize(command.pattern),
    options: _ramda2.default.map(reformatOption, command.options)
  });
};

// parseOptions :: [Option] -> [String] -> Validation Result
var parseOptions = function parseOptions(options, args) {
  // if there are no args, then all options have been parsed
  if (args.length === 0) {
    return Success.of({ params: {}, leftover: [] });
  }
  // check if the next argument is an option
  var next = _ramda2.default.head(args);
  if (argIsMultiBoolOpt(next)) {
    // parse the mutliopt and place params in the proper result format
    var multiOpt = _ramda2.default.map(function (params) {
      return { params: params, leftover: _ramda2.default.tail(args) };
    }, parseMultiOpt(options, next));
    // recursively parse the leftover options
    var others = parseOptions(options, _ramda2.default.tail(args));
    // and merge the results together
    return multiOpt.map(mergeResults).ap(others);
  } else if (argIsOption(next)) {
    // try to parse with all the options
    var attempts = _ramda2.default.map(function (option) {
      return parseSingleOpt(option, args);
    }, options);
    var option = _ramda2.default.find(function (x) {
      return x.isSuccess;
    }, attempts);
    if (!option) {
      return Failure.of(['Unknown option "' + next + '".']);
    }
    // recursively parse the leftover of the options, merge back together
    // and flatten using .chain
    return option.chain(function (result) {
      return parseOptions(options, result.leftover).map(mergeResults(result));
    });
  } else {
    // if there are no options, then pass on the leftover args
    return Success.of({ params: {}, leftover: args });
  }
};

// cli :: Spec -> String|Array -> Anything
var cli = function cli(spec) {
  return function (cmd) {
    // cmd can be a string, in which we'll tokenize
    // and if its process.argv, then we'll remove node filename
    var args = cmdToArgs(cmd);
    // if there are no arges or a help flag, log out the help
    if (args.length === 0 || args[0] === '--help') {
      // XXX display help
      console.log(JSON.stringify(spec, null, 2));
      return;
    }
    // reformat the commands and options in the spec with tokens,
    // parse long and short options, etc.
    spec = _extends({}, spec, {
      commands: _ramda2.default.map(reformatCommand, spec.commands)
    });
    // attempt parse with each command
    // XXX clean this up with ramda and smaller pure functions
    var attempts = spec.commands.map(function (command) {
      // attempt to parse out position tokens
      return parsePositionalTokens(command.tokens, args).chain(function (result) {
        return(
          // attempt to parse out option arguments
          parseOptions(command.options, result.leftover).map(mergeResults(result))
        );
      })
      // if all went well, then lets run the action
      .chain(function (_ref2) {
        var params = _ref2.params;
        var leftover = _ref2.leftover;

        var value = command.action(params);
        // if the action returns a function, then lets run
        // that function with the leftover of the args
        if (_isJs2.default.fn(value)) {
          return value(leftover);
        } else if (leftover.length > 0) {
          return Failure.of(['Leftover arguments: ' + _ramda2.default.join(' ', leftover)]);
        } else {
          // XXX this could be a value or a
          return _validation2.default.coerse(value);
        }
      });
    });

    var result = _ramda2.default.find(function (x) {
      return x.isSuccess;
    }, attempts);
    if (result) {
      return result;
    } else {
      // XXX throw / print out failure
      return attempts;
    }
  };
};

exports.default = cli;