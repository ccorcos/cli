import cli from '../src/cli'

const program = cli({
  name: 'mexican',
  description: 'any kind of mexican food',
  version: '0.1.2',
  commands: [{
    pattern: '<item>',
    description: 'order any kind of mexican food',
    options: [{
      pattern: '-g, --guac',
      description: 'add guacamole',
    }, {
      pattern: '-p, --pico',
      description: 'add pico de gallo',
    }],
    action({item, pico, guac}) {
      const toppings = [].concat(pico ? ['pico'] : [])
                         .concat(guac ? ['guac'] : [])
                         .join(' and ')
      return `ordered a ${item} with ${toppings ? toppings : 'nothing on it'}.`
    }
  }]
})

export default program