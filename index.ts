const fs = require("fs");

interface Base {
  name: string;
  x: number;
  y: number;
}

interface Client extends Base {
  demand: number;
}

interface AppConfig {
  numberOfCars: number;
  carCapacity: number;
  base: Base;
  clients: Client[]
  numberOfClients: number;
}

// error handling for standalone app
// process.on("uncaughtException", function (err) {
//   console.log(err);
//   process.stdin.resume();
// });

let appConfig: AppConfig;


const getConfig = (): AppConfig => {
  // TODO add custom config handling
  let jsonData = JSON.parse(fs.readFileSync(__dirname + '/params/default.json'));
  return jsonData;
}

const main = () => {
  appConfig = getConfig();
  console.log(appConfig);
}

main();