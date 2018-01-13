const request = require('request')
const otherHoldings = require('./holdings.json')
const previousPosition = require('./last.json')
const crypto = require('crypto')
const BFX = require('bitfinex-api-node')
const inquirer = require('inquirer');
var fs = require('fs');
const selectShell = require('select-shell');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').load();
}

const API_KEY = process.env.API_KEY;
const API_KEY_SECRET = process.env.API_KEY_SECRET;
const bfxRest = new BFX(API_KEY, API_KEY_SECRET, {version: 1}).rest



const getHoldings = () => new Promise((resolve, reject) => {
  bfxRest.wallet_balances((err, res) => {
    if (err) reject(err);
  	resolve(
      res
        .filter(holding => holding.currency !== 'usd')
        .filter(holding => holding.amount > 0)
        .reduce((result, holding) => {
          result[holding.currency] = Number(holding.amount);
          return result;
        }, {})
    );
  })
})

const getUSDholding = () => new Promise((resolve, reject) => {
  bfxRest.wallet_balances((err, res) => {
    if (err) reject(err);
  	resolve(
      res
        .filter(holding => holding.currency === 'usd')
    );
  })
})

const getLastPrice = (cur) => new Promise((resolve, reject) => {
  bfxRest.ticker(`${cur.toUpperCase()}USD`, (err, res) => {
    if (err) reject("Cooling down");
    if (!res || !res.last_price){
      reject("Cooling down")
    }
    else {
      resolve({
        cur,
        price: Number(res.last_price)
      });
    }
  })
})

const convertToZar = (usd) => {
  return new Promise((res, rej) => {
    request.get(`https://api.fixer.io/latest?base=USD&symbols=ZAR`,
      function(error, response, body) {
        res(Number(JSON.parse(body).rates.ZAR) * usd)
      }
    );
  })
}

const getTotalHolding = (holdings, cur) => {
  return holdings[cur] instanceof Array ?
    holdings[cur].reduce((total, holding) => total + holding, 0):
    holdings[cur]
}

const savePositions = (holdingsValue) =>{
  fs.renameSync('last.json', `${Date.now()}.json`, function(err) {
      if (err) {
          console.log('ERROR: ' + err);
          throw err;
      }
      console.log('File renamed!!');
  });
  fs.writeFileSync("last.json", JSON.stringify(
    holdingsValue
      .reduce((res, obj) => {
        res[obj.currency] = Number(obj.value);
        return res;
      }, {})
  ), function(err) {
      if(err) {
          console.log(err);
          return(err);
      }
  });
}

const displayHoldings = () =>
  getHoldings().then(holdings => {
      const DECIMAL_POINTS = 2;
      const promises = Object.keys(Object.assign(holdings, otherHoldings)).map(getLastPrice);
      return Promise.all(promises).then(results => {
        let totalHoldings = 0;
        console.log('===========================================')
        console.log('USD      COIN   PRICE              UNITS')
        console.log('===========================================')
        const holdingsValue = [];
        const lastResult = results
          .map(result => {
            const holdingPrice = result.price * getTotalHolding(holdings, result.cur)
            totalHoldings += holdingPrice;
            return {...result, price: result.price.toFixed(DECIMAL_POINTS), value: holdingPrice.toFixed(DECIMAL_POINTS), holding: holdings[result.cur]}
          });
          lastResult.forEach(res => {
            if(res.value < previousPosition[res.cur.toLowerCase()]){
              console.log(`${res.value} \t ${res.cur.toUpperCase()} @ \tUSD ${res.price} \t x ${res.holding.toFixed(DECIMAL_POINTS)}`.red)
            }
            else if (res.value > previousPosition[res.cur.toLowerCase()]){
              console.log(`${res.value} \t ${res.cur.toUpperCase()} @ \tUSD ${res.price} \t x ${res.holding.toFixed(DECIMAL_POINTS)}`.green)
            }
            else if (res.value == previousPosition[res.cur.toLowerCase()]){
              console.log(`${res.value} \t ${res.cur.toUpperCase()} @ \tUSD ${res.price} \t x ${res.holding.toFixed(DECIMAL_POINTS)}`.blue)
            }
          })
          lastResult.forEach(res => holdingsValue.push({
            currency: res.cur, value: res.value
          }));
        console.log('===========================================')
        console.log('TOTAL: \t\tUSD ' + totalHoldings.toFixed(DECIMAL_POINTS))
        return getUSDholding().then(res => {
          console.log('WALLET:\t\tUSD ' + Number(res[0].amount).toFixed(DECIMAL_POINTS))
          return convertToZar(totalHoldings + Number(res[0].amount)).then(zar => {
            console.log('\t\tZAR ' + zar.toFixed(DECIMAL_POINTS))
            return savePositions(holdingsValue);
          }).catch(Promise.reject)
        }).catch(Promise.reject)
      }).catch(Promise.reject)
  }).catch(Promise.reject)

const sell = (cur, units, price) => new Promise((resolve, reject) => {
  bfxRest.new_order(cur.toLowerCase() + 'usd', units, price, 'bitfinex', 'sell', 'exchange limit', (err, res) => {
    if (err) {
      console.log(err);
      reject(err);
    }
    console.log(res);
    resolve(res);
  })
})

const buy = (cur, units, price) => new Promise((resolve, reject) => {
  bfxRest.new_order(cur.toLowerCase() + 'usd', units, price, 'bitfinex', 'buy', 'exchange limit', (err, res) => {
    if (err) {
      console.log(err);
      reject(err);
    }
    console.log(res);
    resolve(res);
  })
})

const activeOrders = () => new Promise((resolve, reject) => {
  bfxRest.active_orders((err, res) => {
    if (err) {
      console.log(err);
      reject(err);
    }
    console.log(res);
    resolve(res);
  })
})

const cancelOrder = (orderNumber) => new Promise((resolve, reject) => {
  bfxRest.cancel_order(orderNumber, (err, res) => {
    if (err) {
      console.log(err);
      reject(err);
    }
    console.log(res);
    resolve(res);
  })
})

const list = selectShell(
  {
    pointer: '> ',
    pointerColor: 'red',
    checked: ' ✓',
    unchecked: '',
    checkedColor: 'green',
    msgCancel: 'Cheers!',
    msgCancelColor: 'blue',
    multiSelect: false,
    inverse: false,
    prepend: false
  }
);
list
  .option('display holdings', 'display')
  .option('display orders', 'orders')
  .option('buy currency', 'buy')
  .option('sell currency', 'sell')
  .option('cancel order', 'cancel')
  .option('exit')
  .list();

list.on('select', function(options){
  new Promise((resolve, reject) => {
    switch(options[0].value){
      case 'display': {
        console.clear()
        return displayHoldings().then(resolve).catch(reject);
      }
      case 'buy': {
        return inquirer.prompt([
          {
            type: 'input',
            name: 'currency',
            message: 'currency'
          },
          {
            type: 'input',
            name: 'units',
            message: 'units'
          },
          {
            type: 'input',
            name: 'price',
            message: 'price'
          }
        ])
        .then(function (result) {
          return buy(result.currency, result.units, result.price).then(resolve).catch(reject);
        })
        .catch(reject);
      }
      case 'sell': {
        return inquirer.prompt([
          {
            type: 'input',
            name: 'currency',
            message: 'currency'
          },
          {
            type: 'input',
            name: 'units',
            message: 'units'
          },
          {
            type: 'input',
            name: 'price',
            message: 'price'
          }
        ])
        .then(function (result) {
          return sell(result.currency, result.units, result.price).then(resolve).catch(reject);
        })
        .catch(reject);
      }
      case 'orders': {
        return activeOrders().then(resolve).catch(reject);
      }
      case 'cancel': {
        return inquirer.prompt([
          {
            type: 'input',
            name: 'ordernumber',
            message: 'order number'
          }
        ])
        .then(function (result) {
          return cancelOrder(result.ordernumber, result.units, result.price).then(resolve).catch(reject);
        })
        .catch(reject);
      }
      default: {
        return displayHoldings().then(resolve).catch(reject);
      }
    }
  })
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log(err)
    process.exit(0);
  })
});
