import _ from 'lodash';
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
let distanceMatrix: number[][];
let pheromoneMatrix: number[][];
let demandMatrix: number[];

const getConfig = (): AppConfig => {
  // TODO add custom config handling
  let jsonData = JSON.parse(fs.readFileSync(__dirname + '/params/default.json'));
  return { ...jsonData, numberOfClients: jsonData.clients.length };
}

const createMatrixes = () => {
  const coords = [appConfig.base].concat(appConfig.clients).map(location => ({ x: location.x, y: location.y}));
  let distanceMatrix = new Array<Array<number>>();
  let pheromoneMatrix = new Array<Array<number>>();
  let demandMatrix = new Array<number>()
  for (let i = 0; i < coords.length; i++) {
    distanceMatrix.push(new Array<number>());
    pheromoneMatrix.push(new Array<number>());
    for (let j = 0; j < coords.length; j++) {
      distanceMatrix[i].push(getDistanceBetweenLocations(coords[i], coords[j]));
      pheromoneMatrix[i].push(1);
    }
  }
  demandMatrix.push(0) // depot demand
  demandMatrix = demandMatrix.concat((appConfig.clients).map(client => client.demand));
  return { distanceMatrix, pheromoneMatrix, demandMatrix };
}

const getDistanceBetweenLocations = (locationA: {x: number, y: number}, locationB: {x: number, y: number}): number => {
  const xPosition: number = locationA.x - locationB.x;
  const yPosition: number = locationA.y - locationB.y;
  return Math.sqrt(Math.pow(xPosition, 2) + Math.pow(yPosition, 2));
};

const getProbabilities = ({ locationIndex, alpha = 1, beta = 1 } : {locationIndex: number, alpha?: number, beta?: number}) => {
  //temp array na trzymanie iloczynu feromonu i drogi
  let temp = new Array<number>();
  let probabilities = new Array<number>();
  for (let i = 0; i <= appConfig.numberOfClients; i++) {
    // nie możemy iść do samego siebie ani do juz obsluzonego klienta / bazy
    if (i === locationIndex || demandMatrix[i] === 0) {
      temp.push(0);
    } else {
      temp.push(Math.pow(pheromoneMatrix[locationIndex][i], alpha) * Math.pow((1/distanceMatrix[locationIndex][i]), beta))
    }
  }
  for (let i = 0; i <= appConfig.numberOfClients; i++) {
    // nie możemy iść do samego siebie ani do juz obsluzonego klienta / bazy
    if (i === locationIndex || demandMatrix[i] === 0) {
      probabilities.push(0);
    } else {
      //suma wszystkich elementow z lodasha
      const sum = _.sum(temp);
      probabilities.push(temp[i] / sum)
    }
  }
  return probabilities;
}

const main = () => {
  appConfig = getConfig();
  // dekonstruktor koks ale chyba lepiej mieć to globalnie
  // let { distanceMatrix, pheromoneMatrix }  = createMatrixes();
  const matrixes  = createMatrixes();
  distanceMatrix = matrixes.distanceMatrix;
  pheromoneMatrix = matrixes.pheromoneMatrix;
  demandMatrix = matrixes.demandMatrix;
  const x = getProbabilities({ locationIndex: 3});
  console.log(x);
}

main();