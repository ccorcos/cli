import cli from '../src/cli'
import R from 'ramda'

const options = [{
  pattern: '-b, --boolean',
  description: 'boolean example'
}, {
  pattern: '-t, --true',
  description: 'another boolean example'
}, {
  pattern: '-f, --false',
  description: 'another boolean example'
}, {
  pattern: '-a, --arg <arg>',
  description: 'positional example'
}, {
  pattern: '-s, --args <foo> <bar>',
  description: 'another positional example'
}, {
  pattern: '-l, --list <list...>',
  description: 'variadic example'
}, {
  pattern: '-z, --zoop <zoop> <zoops...>',
  description: 'positional and variadic example'
}]

const main = {
  name: 'main',
  description: 'an example cli program',
  version: '0.0.1',
  commands: [{
    pattern: 'position <pos>',
    description: 'positional example',
    options: options,
    action: R.identity
  }, {
    pattern: 'positions <beep> <boop>',
    description: 'multpile positional example',
    options: options,
    action: R.identity
  }, {
    pattern: 'variadic <files...>',
    description: 'variadic example',
    options: options,
    action: R.identity
  }, {
    pattern: 'posvar <pvar> <vvar...>',
    description: 'positional and variadic example',
    options: options,
    action: R.identity
  }, {
    pattern: 'recur <loop>',
    description: 'recursive',
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

const program = cli(main)

tests.forEach(({input, output}) => {
  const result = program(input).value
  if (R.equals(result, output)) {
    console.log('.')
  } else {
    console.log('error:', input)
    console.log('expected:', output)
    console.log('result:', result)
  }
})
