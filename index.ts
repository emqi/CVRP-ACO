import _ from 'lodash';
const fs = require("fs");
const prompt = require('prompt-sync')();

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
  numberOfIterations?: number;
  alpha?: number;
  beta?: number;
  rho?: number;
}

interface CarRoute {
  route: number[];
  distance: number;
}

interface Solution {
  routes: CarRoute[];
  totalDistance: number;
}

interface SavedResult {
  config: AppConfig;
  result: Solution;
}

// error handling dla zbudowanej apki - odkomentowac przed buildem
// process.on("uncaughtException", function (err) {
//   console.log(err);
//   process.stdin.resume();
// });

let appConfig: AppConfig; // jesli nie zostana dostarczone w configu to domyslnie alpha, beta = 1, rho = 0.5, liczba iteracji = 1000
let distanceMatrix: number[][];
let pheromoneMatrix: number[][];
let demandMatrix: number[]; // demand działa jako tablica - kiedy demand dla lokacji spada do 0, zostaje wykluczona z dalszego losowania
let bestSolution: Solution = { } as any;

const getConfig = (): AppConfig => {
  const paramFolder = 'params/'
  let jsonData: AppConfig;
  let availableParamsList = new Array<string>();
  fs.readdirSync(paramFolder).forEach((filename: string) => {
    if(filename.match(/.json$/i)) {
      availableParamsList.push(filename);
    }
  });
  if (availableParamsList.length === 0) {
    console.error(`Brak pliku konfiguracyjnego - plik konfiguracyjny w formie pliku JSON powinien znajgować się w folderze "params" w katalogu root programu.`);
    process.exit(0);
  } else if (availableParamsList.length === 1) {
    jsonData = JSON.parse(fs.readFileSync(paramFolder + availableParamsList[0]));
  } else {
    console.log("Dostępne pliki parametrów: ", availableParamsList);
    const name = prompt('Wybierz plik, który powinien zostać załadowany: ');
    if (!availableParamsList.includes(name)) {
      console.error(`Brak pliku konfiguracyjnego o podanej nazwie. Sprawdź pisownię.`);
      process.exit(0);
    } else {
      jsonData = JSON.parse(fs.readFileSync(paramFolder + name));
    }
  }
  if (_.sumBy(jsonData.clients, 'demand') > jsonData.carCapacity * jsonData.numberOfCars) {
    console.error(`Nieprawidłowa konfiguracja - calkowite zapotrzebowanie nie może być większe od łącznej ładowności samochodów!`);
    process.exit(0);
  }
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

const drawDestination = (probabilities: number[]) => {
  let tweakedProbabilities = new Array<{probability: number, originalIndex: number}>();
  let cumulativeSums = new Array<{cumulativeSum: number, originalIndex: number}>();
  let destinationIndex: number;

  tweakedProbabilities = probabilities.map((prob, index) => ({ probability: prob, originalIndex: index})).filter(tProb => tProb.probability != 0);
  for (let i = 0; i < tweakedProbabilities.length; i++) {
    // suma wszystkich elementow po prawej od obecnego z obecnym włącznie
    cumulativeSums.push({ cumulativeSum: _.sumBy(tweakedProbabilities.slice(i), 'probability'), originalIndex: tweakedProbabilities[i].originalIndex});
  }
  // losujemy liczbe z zakresu od 0 do 1
  const random = Math.random();
  const cumulativeSumsAboveOrEqualToRandomValue = cumulativeSums.filter(cSum => cSum.cumulativeSum >= random).length;
  // edge case when every value is bigger or equal to random value
  if (cumulativeSumsAboveOrEqualToRandomValue === cumulativeSums.length) {
    destinationIndex = cumulativeSums[cumulativeSums.length-1].originalIndex
  } else {
    destinationIndex = cumulativeSums[cumulativeSumsAboveOrEqualToRandomValue].originalIndex
  }
  return destinationIndex;
}

const getSolution = (): Solution => {
  const numberOfCars = appConfig.numberOfCars;
  const carCapacity = appConfig.carCapacity;
  let solution = new Array<CarRoute>();

  for (let i = numberOfCars; i > 0; i--) {
    solution.push(getCarRoute(carCapacity));
  }

  return { totalDistance: _.sumBy(solution, 'distance'), routes: solution};
}

const getCarRoute = (carCapacity: number): CarRoute => {
  let locationIndex: number = 0; // startujemy w bazie
  let carDistance: number = 0; // dystans przebyty przez samochód
  let route = new Array<number>();
  route.push(0); // punkt startowy
  while (carCapacity > 0 && _.sum(demandMatrix) > 0) {
    let destinationIndex = drawDestination(getProbabilities({ locationIndex, alpha: appConfig.alpha, beta: appConfig.beta }));
    // case gdy miast ma wieksze zapotrzebowanie niz zostalo towaru w samochodzie
    if (demandMatrix[destinationIndex] > carCapacity) {
      demandMatrix[destinationIndex]-=carCapacity;
      carCapacity = 0;
    } else {
      carCapacity-=demandMatrix[destinationIndex];
      demandMatrix[destinationIndex] = 0;
    }
    carDistance += distanceMatrix[locationIndex][destinationIndex];
    locationIndex = destinationIndex;
    route.push(locationIndex);
  }
  // powrót do bazy
  route.push(0);
  carDistance+=distanceMatrix[locationIndex][0];
  return { route, distance: carDistance };
}

const updateFeromones = ({solution, rho = 0.5}: {solution: Solution, rho?: number}) => {
  let newPheromoneMatrix = Object.assign(new Array<number[]>(), pheromoneMatrix);
  let indexes = new Array<{xIndex: number, yIndex: number}>();
  const routes = solution.routes.map(r => r.route);
  for (let i = 0; i < routes.length; i++) {
    indexes = indexes.concat(getIndexes(routes[i]));
  }
  // obliczamy zmiane feromonow dla kazdej z drogi zaleznie od tego czy pojawila sie ona w wynikach
  for (let i = 0; i < newPheromoneMatrix.length; i++) {
    for (let j = 0; j < newPheromoneMatrix.length; j++) {
      if (indexes.some(index => _.isEqual(index, { xIndex: i, yIndex: j}))) {
        // wzor jezeli droga wystapila
        newPheromoneMatrix[i][j] = newPheromoneMatrix[i][j] * rho + newPheromoneMatrix[i][j] / distanceMatrix[i][j];
      } else {
        // wzor jezeli droga nie wystapila
        newPheromoneMatrix[i][j] = newPheromoneMatrix[i][j] * rho;
      }
    }
  }
  pheromoneMatrix = newPheromoneMatrix;
}

const getIndexes = (route: number[]) => {
  let indexes = new Array<{xIndex: number, yIndex: number}>();
  // nie obchodzi nas droga powrotna do bazy
  route = route.slice(0, -1);
  for (let i = 0; i < route.length - 1; i++) {
    indexes.push({ xIndex: route[i], yIndex: route[i+1]})
  }
  return indexes;
}

const displayRoute = (solution: Solution) => {
  console.log('---------- Najlepsze znalezione rozwiązanie: ----------')
  console.log('Final distance:', solution.totalDistance);
  console.log('Final routes:');
  for (let i = 0; i < solution.routes.length; i++) {
    const route = solution.routes[i].route.map(r => (r > 0) ? appConfig.clients[r-1].name : appConfig.base.name);
    console.log(`Car ${i+1}: `, 'Route: ', JSON.stringify(route), 'Route distance: ', solution.routes[i].distance);
  }
}

const saveBestResult = (solution: Solution) => {
  const resultDir = "results/";
  const resultFilename = "results/best.json";
  if (fs.existsSync(resultFilename)) {
    const bestResult: SavedResult = JSON.parse(fs.readFileSync(resultFilename));
    const areConfigsEqual:boolean = compareConfigs(bestResult.config, appConfig);
    console.log(areConfigsEqual);
    if (areConfigsEqual) {
      // jezeli configi sa tak same a nowy rezultat jest lepszy to informujemy uzytkownika i nadpisujemy
      if (bestResult.result.totalDistance > solution.totalDistance) {
        fs.writeFileSync(resultFilename, JSON.stringify({ config: appConfig, result: solution}, null, '\t'));
        console.log();
        console.log(`Nowe najlepsze rozwiązanie dla danej konfiguracji programu!`);
        console.log('Poprzedni najlepszy rezultat wynosił: ', bestResult.result.totalDistance);
      }
    } else {
      // nadpisujemy plik jezeli mamy nowy config
      fs.writeFileSync(resultFilename, JSON.stringify({ config: appConfig, result: solution}, null, '\t'));
    }
  } else {
    // tworzymy plik jezeli go nie bylo
    fs.mkdirSync(resultDir)
    fs.writeFileSync(resultFilename, JSON.stringify({ config: appConfig, result: solution}, null, '\t'));
  }
}

const compareConfigs = (firstConfig: AppConfig, secondConfig: AppConfig): boolean => {
    return firstConfig.numberOfCars === secondConfig.numberOfCars &&
    firstConfig.carCapacity === secondConfig.carCapacity &&
    _.isEqual(firstConfig.base, secondConfig.base) &&
    _.isEqual(firstConfig.clients, secondConfig.clients)
}

const main = () => {
  // KROK 1 - ZBIERAMY DANE
  appConfig = getConfig();
  // KROK 2 - POPULUJEMY TABLICE, w zmiennej matrixes trzymamy oryginalne dane, na innych mozna prowadzic dzialania
  const matrixes  = createMatrixes();
  distanceMatrix = matrixes.distanceMatrix; // ta tablica jest niezmienna, trzymamy tu dystanse
  pheromoneMatrix = matrixes.pheromoneMatrix; // ta tablica jest aktualizowana ale nie jest resetowana pomiedzy petlami
  
  // KROK 3 - zapetlamy algorytm
  for (let i = 0; i < (!!appConfig.numberOfIterations ? appConfig.numberOfIterations : 1000); i++) {
    demandMatrix = Object.assign([], matrixes.demandMatrix); // ta tablica jest resetowana na poczatku kazdej iteracji 
    const currentSolution = getSolution();
    if (!!bestSolution.totalDistance) {
      bestSolution.totalDistance > currentSolution.totalDistance ? bestSolution = currentSolution : bestSolution;
    } else {
      bestSolution = currentSolution;
    }
    updateFeromones({solution: currentSolution, rho: appConfig.rho});
    console.log('Solution found. Solution distance: ', currentSolution.totalDistance);
  }
  displayRoute(bestSolution);
  saveBestResult(bestSolution);
}

main();