import cli from '../src/cli'
import mexican from './mexican'
import R from 'ramda'
import Validation from '../src/validation'

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
    }, {
      pattern: '-o, --olive',
      description: 'add olive topping',
    }],
    action({size, peperoni, olive}) {
      const toppings = [].concat(peperoni ? ['peperoni'] : [])
                         .concat(olive ? ['olive'] : [])
                         .join(' and ')
      return `ordered a ${size} pizza with ${toppings ? toppings : 'no'} toppings`
    }
  }, {
    pattern: 'chinese <dishes...>',
    description: 'order chinese food from your local chinese restaurant',
    options: [{
      pattern: '-d, --delivery <address>',
      description: 'specify an address to deliver to, otherwise pickup'
    }],
    action({dishes, delivery}) {
      const commas = R.init(dishes).join(', ')
      const semantic = (commas ? [commas] : []).concat(R.last(dishes) ? [R.last(dishes)]: []).join(' and ')
      const method = delivery ? `delivered to ${delivery.address}.` : 'for pickup in 15 minutes.'
      return `ordered ${semantic} ${method}`
    }
  }, {
    pattern: '<service>',
    description: 'order from 3rd party services',
    options: [],
    action({service}) {
      return service === "mexican" ? mexican : Validation.Failure.of([`Unknown service "${service}".`])
    }
  }]
})

console.log(order('pizza large').value)
console.log(order('pizza small -p').value)
console.log(order('pizza large -p -o').value)
console.log(order('pizza large -po').value)
console.log(order('chinese white-rice broccoli-beef sesame-chicken').value)
console.log(order(['chinese', 'fried-rice', '--delivery', '225 Bush St, San Francisco']).value)
console.log(order('mexican burrito -g').value)
console.log(order('mexican taco').value)
console.log(order('--help').value)
console.log(order('mexican --help').value)
// console.log(order(process.argv))