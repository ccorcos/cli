import cli from '../src/cli'
import mexican from './mexican'
import R from 'ramda'
import Validation from '../src/validation'
import Task from 'data.task'

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
    }, {
      pattern: '-r, --rush',
      description: 'rush the delivery order'
    }],
    action({dishes, delivery, rush}) {
      const commas = R.init(dishes).join(', ')
      const semantic = (commas ? [commas] : []).concat(R.last(dishes) ? [R.last(dishes)]: []).join(' and ')
      const method = delivery ? `delivered to ${delivery.address}.` : 'for pickup in 15 minutes.'
      if (rush && !delivery) {
        return Validation.Failure.of(['Only chinese food delivery can be rushed.'])
      }
      return `ordered ${semantic} ${rush ? 'rush ' : ''}${method}`
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

const log = (x) => console.log(JSON.stringify(x, null, 2))

// HELP
// log(order('--help').value)
// log(order('mexican --help').value)

// SUCCESS
// log(order('pizza large').value)
// log(order('pizza small -p').value)
// log(order('pizza large -p -o').value)
// log(order('pizza large -po').value)
// log(order('chinese white-rice broccoli-beef sesame-chicken').value)
// log(order(['chinese', 'fried-rice', '--delivery', '225 Bush St, San Francisco']).value)
// log(order('mexican burrito -g').value)
// log(order('mexican taco').value)

// FAILURES (with useful messages)
// log(order('pizza -p').value) // Expected token "<size>", recieved an option "-p".
// log(order('chinese').value) // Expected more arguments. The following tokens are missing: "<dishes...>".
// log(order(['chinese', 'fried-rice', '--delivery']).value) // Expected more arguments. The following tokens are missing: "<address>".
// log(order('piza').value) // Expected a command keyword "pizza". Recieved "piza".  AND  Unknown service "piza".
// log(order('pizza medium -pa')) // Unknown boolean option "-a"
// log(order('pizza medium -p -a')) // Could not parse option "-a".
// log(order(['chinese', 'fried-rice', '-rd', '225 Bush St, San Francisco']).value)  // Only boolean options can be used as a multi-option and "-d, --delivery <address>" has positional arguments (referring to "-rd").
// log(order('pizza large xyz').value) // Leftover arguments: xyz
// log(order('pizza large -p xyz').value) // Leftover arguments: xyz

// CLI
// log(order(process.argv))

const orderPizza = ({size, peperoni}) => new Task((rej, res) => {
  setTimeout(function() {
    res(`ordered a ${size} pizza${peperoni ? ' with peperoni.' : '.'}`)
  }, 1000)
})


const order2 = cli({
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
      return orderPizza({size, peperoni})
    }
  }]
})

console.log(order2('').value)