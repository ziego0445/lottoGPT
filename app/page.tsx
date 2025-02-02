/* eslint-disable @typescript-eslint/no-unused-vars */
'use client'
import { useState, useEffect } from 'react'
import styles from './page.module.css'
import * as XLSX from 'xlsx'
import * as math from 'mathjs'
import { v4 as uuidv4 } from "uuid"
import { motion, AnimatePresence } from "framer-motion"
import Script from 'next/script';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart, Pie, Cell, Legend } from 'recharts';

interface LottoHistory {
  round: number;
  date: string;
  numbers: number[];
  bonus: number;
}

interface LogisticRegressionModel {
  weights: number[];
  bias: number;
}

interface LottoRow {
  회차: number;
  날짜: string;
  '1': number;
  '2': number;
  '3': number;
  '4': number;
  '5': number;
  '6': number;
  보너스: number;
}

interface GenerationProgress {
  stage: '데이터 준비' | '학습' | '학습 진행' | '번호 생성';
  current: number;
  total: number;
  detail?: string;
}

interface PredictionHistoryItem {
  id: number;
  date: string;
  numbers: number[][];  // 2차원 배열로 변경
  trainingSize: number;
}

// 통계를 위한 인터페이스 추가
interface LottoStats {
  frequency: { [key: number]: number };
  oddEvenRatio: { odd: number; even: number };
  sumStats: { min: number; max: number; avg: number };
  consecutiveNumbers: number;
  recentTrends: {
    range1_9: number;
    range10_19: number;
    range20_29: number;
    range30_39: number;
    range40_45: number;
  };
  longTermTrends: {
    range1_9: number;
    range10_19: number;
    range20_29: number;
    range30_39: number;
    range40_45: number;
  };
  duplicateWinnings: {
    numbers: number[];
    count: number;
    rounds: number[];  // 회차 정보 추가
  }[];
}

export default function Home() {
  const [lottoNumbers, setLottoNumbers] = useState<number[][]>([])
  const [historicalData, setHistoricalData] = useState<LottoHistory[]>([])
  const [logisticModels, setLogisticModels] = useState<LogisticRegressionModel[]>([])
  const [trainingSize, setTrainingSize] = useState<number>(0)
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistoryItem[]>([]);
  const [lottoStats, setLottoStats] = useState<LottoStats | null>(null);
  const [maxTrainingSize, setMaxTrainingSize] = useState<number>(30);
  const [cachedRangeData, setCachedRangeData] = useState<{
    [key: string]: LottoHistory[]
  }>({});

  useEffect(() => {
    loadLottoHistory()
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('predictionHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(item => 
          item.id && 
          item.date && 
          Array.isArray(item.numbers) && 
          typeof item.trainingSize === 'number'
        )) {
          setPredictionHistory(parsed);
        }
      }
    } catch (error) {
      console.error('예측 이력 로드 중 오류 발생:', error);
      localStorage.removeItem('predictionHistory');
    }
  }, []);

  useEffect(() => {
    if (predictionHistory.length > 0) {
      localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory.slice(0, 5)));
    }
  }, [predictionHistory]);

  const loadLottoHistory = async () => {
    try {
      const response = await fetch('/lotto.xlsx')
      const arrayBuffer = await response.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer)
      
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (!jsonData || jsonData.length === 0) {
        console.error('엑셀 파일에서 데이터를 읽을 수 없습니다.')
        return
      }

      const formattedData = jsonData.map((row: unknown) => {
        const lottoRow = row as LottoRow;
        if (!lottoRow['회차'] || !lottoRow['날짜'] || !lottoRow['1'] || !lottoRow['2'] || !lottoRow['3'] || 
            !lottoRow['4'] || !lottoRow['5'] || !lottoRow['6'] || !lottoRow['보너스']) {
          console.error('잘못된 데이터 형식:', lottoRow)
          return null
        }

        return {
          round: lottoRow['회차'],
          date: lottoRow['날짜'],
          numbers: [
            lottoRow['1'],
            lottoRow['2'],
            lottoRow['3'],
            lottoRow['4'],
            lottoRow['5'],
            lottoRow['6']
          ],
          bonus: lottoRow['보너스']
        }
      }).filter(item => item !== null)

      if (formattedData.length === 0) {
        console.error('유효한 데이터가 없습니다.')
        return
      }

      setHistoricalData(formattedData)
    } catch (error) {
      console.error('로또 데이터 로드 중 오류 발생:', error)
    }
  }

  const trainLogisticRegression = async () => {
    const randomSize = Math.floor(Math.random() * (200 - 50 + 1)) + 50
    setTrainingSize(randomSize)
    
    await new Promise(resolve => setTimeout(resolve, 0));
    setProgress({
      stage: '데이터 준비',
      current: 0,
      total: 45,
      detail: '학습 데이터 준비 중...'
    });
    
    const models: LogisticRegressionModel[] = []
    const trainingData = historicalData.slice(0, randomSize)
    
    await new Promise(resolve => setTimeout(resolve, 500)); // 데이터 준비 상태 표시를 위한 지연

    for (let targetNumber = 1; targetNumber <= 45; targetNumber++) {
      setProgress({
        stage: '학습',
        current: targetNumber,
        total: 45,
        detail: `${targetNumber}번 모델 학습 준비 중...`
      });
      await new Promise(resolve => setTimeout(resolve, 10));

      const X: number[][] = []
      const y: number[] = []
      
      trainingData.forEach((game, i) => {
        if (i < trainingData.length - 1) {
          const features = new Array(45).fill(0)
          game.numbers.forEach(num => features[num - 1] = 1)
          X.push(features)
          y.push(trainingData[i + 1].numbers.includes(targetNumber) ? 1 : 0)
        }
      })

      const weights = new Array(45).fill(0)
      let bias = 0
      const learningRate = 0.01
      const epochs = 100

      for (let epoch = 0; epoch < epochs; epoch++) {
        if (epoch % 10 === 0) { // 10 에포크마다 상태 업데이트
          setProgress({
            stage: '학습 진행',
            current: epoch + 1,
            total: epochs,
            detail: `${targetNumber}번 모델 학습 중 (${epoch + 1}/${epochs})`
          });
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        for (let i = 0; i < X.length; i++) {
          const z = math.sum(math.dotMultiply(X[i], weights)) + bias
          const prediction = 1 / (1 + Math.exp(-z))
          const error = prediction - y[i]
          
          weights.forEach((w, j) => {
            weights[j] = w - learningRate * error * X[i][j]
          })
          bias = bias - learningRate * error
        }
      }

      models.push({ weights, bias })
    }

    setLogisticModels(models)
    return models
  }

  const trainLogisticRegressionForSet = async (trainingData: LottoHistory[], setNumber: number) => {
    const models: LogisticRegressionModel[] = []
    const totalSteps = 45 * 100; // 45개 모델 * 100 에포크
    let currentStep = 0;

    for (let targetNumber = 1; targetNumber <= 45; targetNumber++) {
      const X: number[][] = []
      const y: number[] = []
      
      trainingData.forEach((game, i) => {
        if (i < trainingData.length - 1) {
          const features = new Array(45).fill(0)
          game.numbers.forEach(num => features[num - 1] = 1)
          X.push(features)
          y.push(trainingData[i + 1].numbers.includes(targetNumber) ? 1 : 0)
        }
      })

      const weights = new Array(45).fill(0)
      let bias = 0
      const learningRate = 0.01
      const epochs = 100

      for (let epoch = 0; epoch < epochs; epoch++) {
        currentStep++;
        if (currentStep % 45 === 0) { // 진행률 업데이트 빈도 조절
          const progress = Math.floor((currentStep / totalSteps) * 100);
          setProgress({
            stage: '번호 생성',
            current: progress,
            total: 100,
            detail: `${setNumber}번째 세트 학습 중... (${progress}% 완료)`
          });
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        for (let i = 0; i < X.length; i++) {
          const z = math.sum(math.dotMultiply(X[i], weights)) + bias
          const prediction = 1 / (1 + Math.exp(-z))
          const error = prediction - y[i]
          
          weights.forEach((w, j) => {
            weights[j] = w - learningRate * error * X[i][j]
          })
          bias = bias - learningRate * error
        }
      }

      models.push({ weights, bias })
    }

    return models
  }

  // 필터링된 데이터 캐싱 함수
  const getFilteredData = (min: number, max: number) => {
    const key = `${min}-${max}`;
    if (!cachedRangeData[key]) {
      const filtered = historicalData.filter(history => 
        history.numbers.some(num => num >= min && num <= max)
      );
      setCachedRangeData(prev => ({ ...prev, [key]: filtered }));
      return filtered;
    }
    return cachedRangeData[key];
  };

  // generateNumbers 함수 최적화
  const generateNumbers = async () => {
    try {
      setProgress({
        stage: '번호 생성',
        current: 0,
        total: 100,
        detail: '데이터 준비 중...'
      });

      const newNumbers: number[][] = [];
      let totalTrainingSize = 0;
      const predictionId = Date.now();

      // 모든 범위의 데이터를 미리 필터링
      const rangeData = {
        range1_9: getFilteredData(1, 9),
        range10_19: getFilteredData(10, 19),
        range20_29: getFilteredData(20, 29),
        range30_39: getFilteredData(30, 39),
        range40_45: getFilteredData(40, 45)
      };

      // 랜덤 데이터 추출 함수 최적화
      const getRandomData = (data: LottoHistory[], size: number) => {
        const shuffled = data.slice(0, Math.min(size * 2, data.length))
          .sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(size, data.length));
      };

      for (let set = 0; set < 5; set++) {
        setProgress({
          stage: '번호 생성',
          current: set * 20,
          total: 100,
          detail: `${set + 1}번째 세트 생성 중...`
        });

        // 각 범위별 크기 계산
        const sizes = {
          range1_9: Math.floor(Math.random() * (maxTrainingSize - 30 + 1)) + 30,
          range10_19: Math.floor(Math.random() * (maxTrainingSize - 30 + 1)) + 30,
          range20_29: Math.floor(Math.random() * (maxTrainingSize - 30 + 1)) + 30,
          range30_39: Math.floor(Math.random() * (maxTrainingSize - 30 + 1)) + 30,
          range40_45: Math.floor(Math.random() * (maxTrainingSize - 30 + 1)) + 30
        };

        // 병렬로 데이터 추출
        const trainingData = await Promise.all([
          getRandomData(rangeData.range1_9, sizes.range1_9),
          getRandomData(rangeData.range10_19, sizes.range10_19),
          getRandomData(rangeData.range20_29, sizes.range20_29),
          getRandomData(rangeData.range30_39, sizes.range30_39),
          getRandomData(rangeData.range40_45, sizes.range40_45)
        ]).then(results => results.flat());

        // 중복 제거 최적화
        const uniqueTrainingData = Array.from(
          new Map(trainingData.map(item => [JSON.stringify(item), item])).values()
        );

        totalTrainingSize += uniqueTrainingData.length;

        const models = await trainLogisticRegressionForSet(uniqueTrainingData, set + 1);

        const lastGame = uniqueTrainingData[0];
        const features = new Array(45).fill(0);
        lastGame.numbers.forEach(num => features[num - 1] = 1);

        const probabilities = models.map((model, index) => {
          const z = math.sum(math.dotMultiply(features, model.weights)) + model.bias;
          const probability = 1 / (1 + Math.exp(-z));
          return { number: index + 1, probability };
        });

        probabilities.sort((a, b) => b.probability - a.probability);
        const numbers = probabilities.slice(0, 6).map(p => p.number).sort((a, b) => a - b);
        newNumbers.push(numbers);

        // 각 세트가 완료될 때마다 예측 이력 업데이트
        const currentPrediction: PredictionHistoryItem = {
          id: predictionId,
          date: new Date().toLocaleString('ko-KR'),
          numbers: newNumbers.slice(),
          trainingSize: Math.floor(totalTrainingSize / (set + 1))
        };

        setPredictionHistory(prev => {
          const filtered = prev.filter(p => p.id !== predictionId);
          return [currentPrediction, ...filtered];
        });

        if (set < 4) {
          setProgress({
            stage: '번호 생성',
            current: 0,
            total: 100,
            detail: `${set + 2}번째 세트 준비 중...`
          });
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setProgress(null);
    } catch (error) {
      console.error('번호 생성 중 오류 발생:', error);
      setProgress(null);
    }
  };

  // 통계 계산 함수 추가
  const calculateStats = (data: LottoHistory[]) => {
    const frequency: { [key: number]: number } = {};
    let oddCount = 0;
    let evenCount = 0;
    let totalSum = 0;
    let minSum = Infinity;
    let maxSum = 0;
    let consecutiveCount = 0;

    // 1-45까지 초기화
    for (let i = 1; i <= 45; i++) {
      frequency[i] = 0;
    }

    data.forEach(history => {
      // 빈도수 계산
      history.numbers.forEach(num => {
        frequency[num]++;
        if (num % 2 === 0) evenCount++;
        else oddCount++;
      });

      // 합계 통계
      const sum = history.numbers.reduce((a, b) => a + b, 0);
      totalSum += sum;
      minSum = Math.min(minSum, sum);
      maxSum = Math.max(maxSum, sum);

      // 연속된 숫자 확인
      const sortedNumbers = [...history.numbers].sort((a, b) => a - b);
      for (let i = 0; i < sortedNumbers.length - 1; i++) {
        if (sortedNumbers[i + 1] - sortedNumbers[i] === 1) {
          consecutiveCount++;
        }
      }
    });

    // 500회 트렌드 분석
    const longTermGames = data.slice(0, 500);
    const longTermTrends = {
      range1_9: 0,
      range10_19: 0,
      range20_29: 0,
      range30_39: 0,
      range40_45: 0
    };

    longTermGames.forEach(game => {
      game.numbers.forEach(num => {
        if (num <= 9) longTermTrends.range1_9++;
        else if (num <= 19) longTermTrends.range10_19++;
        else if (num <= 29) longTermTrends.range20_29++;
        else if (num <= 39) longTermTrends.range30_39++;
        else longTermTrends.range40_45++;
      });
    });

    // 중복 당첨번호 확인
    const numberSetsMap = new Map<string, { count: number; rounds: number[] }>();
    data.forEach((history) => {
      const sortedNumbers = [...history.numbers].sort((a, b) => a - b);
      const key = sortedNumbers.join(',');
      if (numberSetsMap.has(key)) {
        const existing = numberSetsMap.get(key)!;
        existing.count++;
        existing.rounds.push(history.round);
      } else {
        numberSetsMap.set(key, { count: 1, rounds: [history.round] });
      }
    });

    const duplicateWinnings = Array.from(numberSetsMap.entries())
      .filter(([_, value]) => value.count > 1)
      .map(([numbers, value]) => ({
        numbers: numbers.split(',').map(Number),
        count: value.count,
        rounds: value.rounds
      }))
      .sort((a, b) => b.count - a.count);

    setLottoStats({
      frequency,
      oddEvenRatio: {
        odd: (oddCount / (oddCount + evenCount)) * 100,
        even: (evenCount / (oddCount + evenCount)) * 100
      },
      sumStats: {
        min: minSum,
        max: maxSum,
        avg: Math.round(totalSum / data.length)
      },
      consecutiveNumbers: consecutiveCount,
      recentTrends: {
        range1_9: 0,
        range10_19: 0,
        range20_29: 0,
        range30_39: 0,
        range40_45: 0
      },
      longTermTrends: longTermTrends,
      duplicateWinnings
    });
  };

  useEffect(() => {
    if (historicalData.length > 0) {
      calculateStats(historicalData);
    }
  }, [historicalData]);

  // clearPredictionHistory 함수 추가
  const clearPredictionHistory = () => {
    setPredictionHistory([]);
    localStorage.removeItem('predictionHistory');
  };

  // 예측번호와 기존 당첨번호 비교 함수 추가
  const checkPredictionMatch = (numbers: number[]) => {
    const sortedNumbers = [...numbers].sort((a, b) => a - b).join(',');
    return historicalData.find(history => 
      [...history.numbers].sort((a, b) => a - b).join(',') === sortedNumbers
    );
  };

  // 공유 텍스트 생성 함수 추가
  const generateShareText = (prediction: PredictionHistoryItem) => {
    const sets = prediction.numbers.map((set, index) => 
      `${index + 1}세트: ${set.join(', ')}`
    ).join('\n');

    return `🎯 LottoGPT AI가 예측한 로또번호\n\n${sets}\n\n` + 
      `🤖 최첨단 AI가 ${prediction.trainingSize}회차의 데이터를 분석하여 예측한 번호입니다.\n` +
      `✨ 당신의 행운을 기원합니다!\n\n` +
      `🌐 LottoGPT: https://lottogpt.netlify.app`;
  };

  // 공유하기 함수 추가
  const handleShare = async (prediction: PredictionHistoryItem) => {
    const shareText = generateShareText(prediction);
    
    try {
      await navigator.clipboard.writeText(shareText);
      alert('예측번호가 클립보드에 복사되었습니다!');
    } catch (error) {
      console.error('클립보드 복사 실패:', error);
      alert('클립보드 복사에 실패했습니다. 수동으로 복사해주세요.');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 py-12 px-4 sm:px-6 lg:px-8 text-white">
      {/* 카카오 광고 추가 */}
      <div className="max-w-4xl mx-auto mb-8">
        <ins 
          className="kakao_ad_area" 
          style={{ display: "none" }}
          data-ad-unit="DAN-wRKhfzBFsBR6JQsR"
          data-ad-width="320"
          data-ad-height="50"
        />
        <Script
          type="text/javascript"
          src="//t1.daumcdn.net/kas/static/ba.min.js"
          async
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto"
      >

        <h1 className="text-5xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-pink-400 mb-2 whitespace-nowrap">
          LottoGPT
        </h1>
        <p className="text-xl text-center text-blue-200 mb-2 whitespace-nowrap">
          AI 기반 로또 번호 생성기
        </p>
        <p className="text-sm text-center text-blue-300/80 mb-12 whitespace-normal">
          최근 500회의 당첨번호를 기반으로 학습하여 최적의 로또번호를 예측합니다.
        </p>

        <motion.div
          className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-xl shadow-2xl p-8 mb-12"
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <div className="mb-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-blue-200 mb-2 whitespace-nowrap">
                AI 학습 데이터 설정
              </h3>
              <p className="text-sm text-blue-300/80 whitespace-normal">
                기존 당첨번호를 AI에게 학습시키는 데이터양을 선택합니다. 데이터가 많을수록 더 많은 패턴을 학습할 수 있습니다.
              </p>
            </div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-blue-200 whitespace-nowrap">
                학습 데이터 크기: {maxTrainingSize}회차
              </label>
            </div>
            <input
              type="range"
              min="30"
              max="200"
              value={maxTrainingSize}
              onChange={(e) => setMaxTrainingSize(Number(e.target.value))}
              className="w-full h-2 bg-blue-900 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs text-blue-300 mt-1">
              <span className="whitespace-nowrap">최소 30회차</span>
              <span className="whitespace-nowrap">최대 200회차</span>
            </div>
          </div>

          <button
            onClick={generateNumbers}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 shadow-lg"
            disabled={!!progress}
          >
            {progress ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                AI 분석 중...
              </span>
            ) : (
              "번호 생성하기"
            )}
          </button>

          {progress && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
              <h3 className="text-lg font-semibold text-blue-300 mb-2">{progress.stage}</h3>
              <p className="text-sm text-blue-200 mb-2">{progress.detail}</p>
              
              {/* 로딩 애니메이션 */}
              <div className="flex justify-center mb-4">
                <div className="flex gap-2">
                  {[...Array(6)].map((_, index) => {
                    const randomNum = Math.floor(Math.random() * 45) + 1;
                    return (
                      <motion.div
                        key={index}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          randomNum <= 10
                            ? "bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-900"
                            : randomNum <= 20
                              ? "bg-gradient-to-r from-blue-400 to-blue-600 text-white"
                              : randomNum <= 30
                                ? "bg-gradient-to-r from-red-400 to-red-600 text-white"
                                : randomNum <= 40
                                  ? "bg-gradient-to-r from-green-400 to-green-600 text-white"
                                  : "bg-gradient-to-r from-purple-400 to-purple-600 text-white"
                        }`}
                        animate={{
                          rotate: [0, 360],
                          scale: [1, 1.1, 1],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          delay: index * 0.2,
                          ease: "linear"
                        }}
                      >
                        {randomNum}
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              <div className="w-full bg-blue-900 rounded-full h-2.5 overflow-hidden">
                <motion.div
                  className="bg-gradient-to-r from-blue-400 to-purple-500 h-2.5"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                  transition={{ duration: 0.5 }}
                ></motion.div>
              </div>
            </motion.div>
          )}
        </motion.div>

        <AnimatePresence>
          {predictionHistory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-xl shadow-2xl p-8"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-blue-300">예측 이력</h2>
                <button
                  onClick={clearPredictionHistory}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors duration-200 flex items-center gap-2 text-sm"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                    />
                  </svg>
                  초기화
                </button>
              </div>
              <div className="space-y-6">
                {predictionHistory.map((history) => (
                  <motion.div
                    key={history.id}
                    className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-xl p-4"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* 날짜와 학습 데이터 정보를 세로로 배치 */}
                    <div className="flex flex-col gap-2 mb-3">
                      <span className="text-sm text-blue-300">{history.date}</span>
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-purple-300">
                          학습 데이터: {history.trainingSize}회차
                        </span>
                        <button
                          onClick={() => handleShare(history)}
                          className="self-start px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition-colors duration-200 flex items-center gap-1.5 text-sm"
                        >
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            className="h-4 w-4" 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2} 
                              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" 
                            />
                          </svg>
                          공유하기
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {history.numbers.map((set, setIndex) => (
                        <div key={setIndex} className="flex flex-col p-3 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-lg">
                          <div className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-blue-300">SET {setIndex + 1}</span>
                            {/* 당첨번호 일치 시 메시지를 SET 라벨 아래에 표시 */}
                            {checkPredictionMatch(set) && (
                              <span className="text-xs text-yellow-400 font-medium">
                                {checkPredictionMatch(set)?.round}회차 당첨번호와 동일
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 justify-center w-full mt-2">
                            {set.map((num) => (
                              <div key={num} className="relative flex flex-col items-center">
                                <motion.span
                                  className={`inline-flex items-center justify-center w-11 h-11 rounded-full text-base font-bold ${
                                    num <= 10
                                      ? "bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-900"
                                      : num <= 20
                                        ? "bg-gradient-to-r from-blue-400 to-blue-600 text-white"
                                        : num <= 30
                                          ? "bg-gradient-to-r from-red-400 to-red-600 text-white"
                                          : num <= 40
                                            ? "bg-gradient-to-r from-green-400 to-green-600 text-white"
                                            : "bg-gradient-to-r from-purple-400 to-purple-600 text-white"
                                  }`}
                                  whileHover={{ scale: 1.1 }}
                                  transition={{ type: "spring", stiffness: 300 }}
                                >
                                  {num}
                                </motion.span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 통계 섹션 추가 */}
      {lottoStats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto mt-12"
        >
          <div className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-xl shadow-2xl p-8">
            <h2 className="text-3xl font-bold text-blue-300 mb-6">당첨 번호 통계</h2>
            
            {/* 빈도수 차트 수정 */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-blue-200 mb-4">번호별 출현 빈도 그래프</h3>
              <div className="w-full h-[300px] bg-white bg-opacity-5 rounded-xl p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Object.entries(lottoStats.frequency).map(([num, freq]) => ({
                      number: Number(num),
                      frequency: freq,
                    }))}
                    margin={{ top: 10, right: 30, left: 0, bottom: 5 }}
                  >
                    <XAxis
                      dataKey="number"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                      tickLine={{ stroke: '#94a3b8' }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                      tickLine={{ stroke: '#94a3b8' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                      formatter={(value, name) => {
                        if (name === 'frequency') {
                          return [
                            <span key="value" style={{ color: '#fff' }}>{`${value}회`}</span>,
                            <span key="label" style={{ color: '#fff' }}>출현 횟수</span>
                          ];
                        }
                        return [value, name];
                      }}
                      labelFormatter={(label) => <span key="label" style={{ color: '#fff' }}>{`${label}번`}</span>}
                    />
                    <Bar
                      dataKey="frequency"
                      radius={[4, 4, 0, 0]}
                    >
                      {Object.entries(lottoStats.frequency).map(([num]) => {
                        const number = Number(num);
                        let color;
                        if (number <= 9) color = "#fbbf24";      // 노란색
                        else if (number <= 19) color = "#60a5fa"; // 파란색
                        else if (number <= 29) color = "#ef4444"; // 빨간색
                        else if (number <= 39) color = "#34d399"; // 초록색
                        else color = "#a78bfa";                   // 보라색
                        return <Cell key={`cell-${num}`} fill={color} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 번호대별 출현 빈도 차트 */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-blue-200 mb-4">최근 500회 번호대별 출현 빈도</h3>
              <div className="w-full h-[300px] bg-white bg-opacity-5 rounded-xl p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { range: "1-9", count: lottoStats.longTermTrends.range1_9, color: "#fbbf24" },
                      { range: "10-19", count: lottoStats.longTermTrends.range10_19, color: "#60a5fa" },
                      { range: "20-29", count: lottoStats.longTermTrends.range20_29, color: "#ef4444" },
                      { range: "30-39", count: lottoStats.longTermTrends.range30_39, color: "#34d399" },
                      { range: "40-45", count: lottoStats.longTermTrends.range40_45, color: "#a78bfa" }
                    ]}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <XAxis
                      dataKey="range"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                      formatter={(value) => [
                        <span key="value" style={{ color: '#fff' }}>{`${value}회`}</span>,
                        <span key="label" style={{ color: '#fff' }}>출현횟수</span>
                      ]}
                    />
                    <Bar
                      dataKey="count"
                      radius={[4, 4, 0, 0]}
                    >
                      {[
                        { fill: "#fbbf24" },
                        { fill: "#60a5fa" },
                        { fill: "#ef4444" },
                        { fill: "#34d399" },
                        { fill: "#a78bfa" }
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-4">
                <span className="text-sm text-blue-200">
                  * 최근 500회차의 당첨번호를 분석한 결과입니다.
                </span>
              </div>
            </div>

            {/* 홀짝 비율을 원형 차트로 표시 */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-blue-200 mb-4">홀짝 비율 분포</h3>
              <div className="w-full h-[300px] bg-white bg-opacity-5 rounded-xl p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: '홀수', value: lottoStats.oddEvenRatio.odd },
                        { name: '짝수', value: lottoStats.oddEvenRatio.even }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill="#60a5fa" />
                      <Cell fill="#34d399" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      content={({ payload }) => (
                        <div className="flex justify-center gap-4">
                          {payload?.map((entry, index) => (
                            <div key={`item-${index}`} className="flex items-center">
                              <div
                                className="w-3 h-3 rounded-full mr-2"
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="text-sm text-blue-200">
                                {entry.value}: {entry.payload?.value ? Math.round(entry.payload.value) : 0}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 합계 통계 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white bg-opacity-5 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-blue-200 mb-2">번호 합계</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-sm text-blue-200">최소</div>
                    <div className="text-xl font-bold text-blue-300">{lottoStats.sumStats.min}</div>
                  </div>
                  <div>
                    <div className="text-sm text-blue-200">평균</div>
                    <div className="text-xl font-bold text-blue-300">{lottoStats.sumStats.avg}</div>
                  </div>
                  <div>
                    <div className="text-sm text-blue-200">최대</div>
                    <div className="text-xl font-bold text-blue-300">{lottoStats.sumStats.max}</div>
                  </div>
                </div>
              </div>

              {/* 연속된 숫자 통계 */}
              <div className="bg-white bg-opacity-5 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-blue-200 mb-2">연속 번호</h3>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-300">
                    {lottoStats.consecutiveNumbers}회
                  </div>
                  <div className="text-sm text-blue-200">전체 연속 번호 출현</div>
                </div>
              </div>
            </div>

            {/* 중복 당첨번호 표시 */}
            {lottoStats.duplicateWinnings.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-blue-200 mb-4">중복 당첨번호 이력</h3>
                <div className="space-y-4 bg-white bg-opacity-5 rounded-xl p-4">
                  {lottoStats.duplicateWinnings.map((item, index) => (
                    <div key={index} className="p-4 bg-white bg-opacity-5 rounded-lg">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {item.numbers.map((num) => (
                          <span
                            key={num}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              num <= 10
                                ? "bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-900"
                                : num <= 20
                                  ? "bg-gradient-to-r from-blue-400 to-blue-600 text-white"
                                  : num <= 30
                                    ? "bg-gradient-to-r from-red-400 to-red-600 text-white"
                                    : num <= 40
                                      ? "bg-gradient-to-r from-green-400 to-green-600 text-white"
                                      : "bg-gradient-to-r from-purple-400 to-purple-600 text-white"
                            }`}
                          >
                            {num}
                          </span>
                        ))}
                      </div>
                      <div className="text-sm text-blue-300">
                        <span className="font-semibold">{item.count}회 당첨</span>
                        <span className="ml-2 text-blue-200/80">
                          ({item.rounds.join(', ')}회차)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      <footer className="text-center text-sm text-gray-400 mt-8">
        © 2025 LottoGPT 본 서비스는 참고용이며, 실제 당첨을 보장하지 않습니다.
      </footer>
    </main>
  )
}