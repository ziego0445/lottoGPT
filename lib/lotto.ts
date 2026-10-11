// 로또 데이터 학습/예측/통계 로직 (UI와 무관한 순수 함수)

export interface LottoHistory {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
}

export interface LogisticRegressionModel {
  weights: number[];
  bias: number;
}

export interface DuplicatePattern {
  numbers: number[];
  count: number;
  rounds: number[];
}

export interface RangeCount {
  label: string;
  color: string;
  count: number;
}

export interface LottoStats {
  firstRound: number;
  latestRound: number;
  frequency: { [key: number]: number };
  oddEvenRatio: { odd: number; even: number };
  sumStats: { min: number; max: number; avg: number };
  consecutiveDraws: number;      // 연속 번호가 1쌍 이상 포함된 회차 수
  consecutiveRate: number;       // 위 회차의 비율(%)
  rangeCounts: RangeCount[];     // 최근 RANGE_TREND_SIZE 회차의 번호대별 출현 수
  duplicateWinnings: DuplicatePattern[];
  duplicatePatterns: DuplicatePattern[];
}

export const RANGE_TREND_SIZE = 500;

// 1회 추첨일(2002.12.07)의 판매 마감 시각(토 20:00 KST). 이후 매주 한 회차씩 추첨된다.
const FIRST_DRAW_CUTOFF = Date.parse('2002-12-07T20:00:00+09:00');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// timestamp 시각에 구매할 수 있는(= 예측 대상이 되는) 회차
export const getTargetRound = (timestamp: number) =>
  Math.max(1, Math.floor((timestamp - FIRST_DRAW_CUTOFF) / WEEK_MS) + 2);

// 회차의 추첨일 (YYYY.MM.DD, KST)
export const getDrawDate = (round: number) =>
  new Date(FIRST_DRAW_CUTOFF + (round - 1) * WEEK_MS + 9 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '.');

export interface WinningResult {
  matched: number[];
  bonusMatched: boolean;
  rank: number | null; // 1~5등, 낙첨이면 null
}

export function checkWinning(set: number[], draw: LottoHistory): WinningResult {
  const matched = set.filter(num => draw.numbers.includes(num));
  const bonusMatched = set.includes(draw.bonus);
  let rank: number | null = null;
  if (matched.length === 6) rank = 1;
  else if (matched.length === 5) rank = bonusMatched ? 2 : 3;
  else if (matched.length === 4) rank = 4;
  else if (matched.length === 3) rank = 5;
  return { matched, bonusMatched, rank };
}

// 동행복권 공 색상 구간(1-10, 11-20, 21-30, 31-40, 41-45) 기준. 공, 차트가 같은 기준을 쓴다.
const NUMBER_RANGES = [
  { label: '1-10', max: 10, color: '#fbbf24', ballClass: 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-900' },
  { label: '11-20', max: 20, color: '#60a5fa', ballClass: 'bg-gradient-to-r from-blue-400 to-blue-600 text-white' },
  { label: '21-30', max: 30, color: '#ef4444', ballClass: 'bg-gradient-to-r from-red-400 to-red-600 text-white' },
  { label: '31-40', max: 40, color: '#34d399', ballClass: 'bg-gradient-to-r from-green-400 to-green-600 text-white' },
  { label: '41-45', max: 45, color: '#a78bfa', ballClass: 'bg-gradient-to-r from-purple-400 to-purple-600 text-white' },
];

const getRangeIndex = (num: number) => NUMBER_RANGES.findIndex(range => num <= range.max);

export const getBallClass = (num: number) => NUMBER_RANGES[getRangeIndex(num)].ballClass;

export const getNumberColor = (num: number) => NUMBER_RANGES[getRangeIndex(num)].color;

export const toNumberKey = (numbers: number[]) => [...numbers].sort((a, b) => a - b).join(',');

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

// 한 회차의 당첨번호 → 45차원 원-핫 벡터에서 1인 인덱스 목록
const toFeatureIndexes = (draw: LottoHistory) => draw.numbers.map(num => num - 1);

/**
 * 번호(1~45)마다 "직전 회차 번호 → 이번 회차에 이 번호가 나오는가"를 학습하는 로지스틱 회귀 모델 45개.
 * draws 는 최신 회차가 앞쪽인 배열이며, draws[i](이전 회차)로 draws[i - 1](다음 회차)을 맞히도록 학습한다.
 */
export async function trainModels(
  draws: LottoHistory[],
  onProgress?: (trainedCount: number) => void | Promise<void>,
  { learningRate = 0.01, epochs = 100 } = {},
): Promise<LogisticRegressionModel[]> {
  const samples: { features: number[]; next: Set<number> }[] = [];
  for (let i = 1; i < draws.length; i++) {
    samples.push({ features: toFeatureIndexes(draws[i]), next: new Set(draws[i - 1].numbers) });
  }

  const models: LogisticRegressionModel[] = [];
  for (let target = 1; target <= 45; target++) {
    const weights = new Array(45).fill(0);
    let bias = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      for (const { features, next } of samples) {
        let z = bias;
        for (const f of features) z += weights[f];
        const error = sigmoid(z) - (next.has(target) ? 1 : 0);
        // 입력이 0인 가중치는 기울기가 0이므로 활성 특성만 갱신
        for (const f of features) weights[f] -= learningRate * error;
        bias -= learningRate * error;
      }
    }

    models.push({ weights, bias });
    if (onProgress) {
      await onProgress(target);
      await new Promise(resolve => setTimeout(resolve, 0)); // UI 갱신 기회 제공
    }
  }
  return models;
}

// 마지막(가장 최신) 회차를 입력으로 다음 회차의 번호별 출현 확률을 계산
export function predictProbabilities(models: LogisticRegressionModel[], latestDraw: LottoHistory): number[] {
  const features = toFeatureIndexes(latestDraw);
  return models.map(model => {
    let z = model.bias;
    for (const f of features) z += model.weights[f];
    return sigmoid(z);
  });
}

// 확률을 가중치로 6개 번호를 비복원 추출
function pickWeightedSet(probabilities: number[]): number[] {
  const pool = probabilities.map((weight, index) => ({ number: index + 1, weight }));
  const picked: number[] = [];
  while (picked.length < 6) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let r = Math.random() * total;
    let index = pool.findIndex(item => (r -= item.weight) < 0);
    if (index === -1) index = pool.length - 1; // 부동소수점 오차 대비
    picked.push(pool[index].number);
    pool.splice(index, 1);
  }
  return picked.sort((a, b) => a - b);
}

// 서로 다른 번호 조합 count 세트 생성
export function generateSets(probabilities: number[], count: number): number[][] {
  // 학습 데이터가 적으면 일부 번호 확률이 0이나 1에 가깝게 치우쳐 모든 세트에 같은 번호가 반복되므로
  // 모델 확률과 균등 확률을 반씩 섞어 추출한다.
  const mean = probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length;
  const weights = probabilities.map(p => p + mean);

  const sets = new Map<string, number[]>();
  while (sets.size < count) {
    const set = pickWeightedSet(weights);
    sets.set(toNumberKey(set), set);
  }
  return [...sets.values()];
}

// 같은 번호 조합이 2회 이상 나온 경우를 찾는다 (회차는 오래된 순)
function findRepeatedCombinations(
  data: LottoHistory[],
  getCombinations: (numbers: number[]) => number[][],
): DuplicatePattern[] {
  const map = new Map<string, number[]>();
  [...data].reverse().forEach(history => {
    getCombinations([...history.numbers].sort((a, b) => a - b)).forEach(combination => {
      const key = combination.join(',');
      const rounds = map.get(key);
      if (rounds) rounds.push(history.round);
      else map.set(key, [history.round]);
    });
  });

  return Array.from(map.entries())
    .filter(([, rounds]) => rounds.length > 1)
    .map(([key, rounds]) => ({ numbers: key.split(',').map(Number), count: rounds.length, rounds }))
    .sort((a, b) => b.count - a.count);
}

function triples(numbers: number[]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < numbers.length - 2; i++) {
    for (let j = i + 1; j < numbers.length - 1; j++) {
      for (let k = j + 1; k < numbers.length; k++) {
        result.push([numbers[i], numbers[j], numbers[k]]);
      }
    }
  }
  return result;
}

// data 는 최신 회차가 앞쪽인 배열
export function calculateStats(data: LottoHistory[]): LottoStats {
  const frequency: { [key: number]: number } = {};
  for (let i = 1; i <= 45; i++) frequency[i] = 0;

  let oddCount = 0;
  let totalSum = 0;
  let minSum = Infinity;
  let maxSum = 0;
  let consecutiveDraws = 0;

  data.forEach(history => {
    const sorted = [...history.numbers].sort((a, b) => a - b);
    sorted.forEach(num => {
      frequency[num]++;
      if (num % 2 === 1) oddCount++;
    });

    const sum = sorted.reduce((a, b) => a + b, 0);
    totalSum += sum;
    minSum = Math.min(minSum, sum);
    maxSum = Math.max(maxSum, sum);

    if (sorted.some((num, i) => i > 0 && num - sorted[i - 1] === 1)) {
      consecutiveDraws++;
    }
  });

  const rangeCounts: RangeCount[] = NUMBER_RANGES.map(range => ({ label: range.label, color: range.color, count: 0 }));
  data.slice(0, RANGE_TREND_SIZE).forEach(history => {
    history.numbers.forEach(num => rangeCounts[getRangeIndex(num)].count++);
  });

  const totalNumbers = data.length * 6;

  return {
    firstRound: data[data.length - 1].round,
    latestRound: data[0].round,
    frequency,
    oddEvenRatio: {
      odd: (oddCount / totalNumbers) * 100,
      even: ((totalNumbers - oddCount) / totalNumbers) * 100,
    },
    sumStats: { min: minSum, max: maxSum, avg: Math.round(totalSum / data.length) },
    consecutiveDraws,
    consecutiveRate: Math.round((consecutiveDraws / data.length) * 100),
    rangeCounts,
    duplicateWinnings: findRepeatedCombinations(data, numbers => [numbers]),
    duplicatePatterns: findRepeatedCombinations(data, triples).slice(0, 10), // 상위 10개만 표시
  };
}
