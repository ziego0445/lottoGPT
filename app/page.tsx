/* eslint-disable @typescript-eslint/no-unused-vars */
'use client'
import { useState, useEffect } from 'react'
import styles from './page.module.css'
import * as XLSX from 'xlsx'
import * as math from 'mathjs'
import { v4 as uuidv4 } from "uuid"
import { motion, AnimatePresence } from "framer-motion"
import Script from 'next/script';

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

export default function Home() {
  const [lottoNumbers, setLottoNumbers] = useState<number[][]>([])
  const [historicalData, setHistoricalData] = useState<LottoHistory[]>([])
  const [logisticModels, setLogisticModels] = useState<LogisticRegressionModel[]>([])
  const [trainingSize, setTrainingSize] = useState<number>(0)
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistoryItem[]>([]);

  useEffect(() => {
    loadLottoHistory()
  }, [])

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

  const generateNumbers = async () => {
    try {
      setProgress({
        stage: '번호 생성',
        current: 0,
        total: 100,
        detail: '1번째 세트 준비 중...'
      });
      
      const newNumbers: number[][] = []
      let totalTrainingSize = 0  // 전체 학습 데이터 크기를 추적

      for (let set = 0; set < 5; set++) {
        const randomSize = Math.floor(Math.random() * (80 - 30 + 1)) + 30; // 30~80 사이의 랜덤 크기
        totalTrainingSize += randomSize  // 각 세트의 학습 데이터 크기를 누적

        // 학습 데이터의 시작 위치도 랜덤하게 선택
        const startIdx = Math.floor(Math.random() * (historicalData.length - randomSize))
        const trainingData = historicalData.slice(startIdx, startIdx + randomSize)
        
        const models = await trainLogisticRegressionForSet(trainingData, set + 1)

        // 번호 생성 로직
        const lastGame = trainingData[0]
        const features = new Array(45).fill(0)
        lastGame.numbers.forEach(num => features[num - 1] = 1)

        const probabilities = models.map((model, index) => {
          const z = math.sum(math.dotMultiply(features, model.weights)) + model.bias
          const probability = 1 / (1 + Math.exp(-z))
          return { number: index + 1, probability }
        })

        probabilities.sort((a, b) => b.probability - a.probability)
        const numbers = probabilities.slice(0, 6).map(p => p.number).sort((a, b) => a - b)
        newNumbers.push(numbers)

        if (set < 4) { // 마지막 세트가 아닌 경우에만 다음 세트 준비 메시지 표시
          setProgress({
            stage: '번호 생성',
            current: 0,
            total: 100,
            detail: `${set + 2}번째 세트 준비 중...`
          });
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // 예측 이력 저장 시 평균 학습 크기 사용
      const newPrediction: PredictionHistoryItem = {
        id: Date.now(),
        date: new Date().toLocaleString('ko-KR'),
        numbers: newNumbers,
        trainingSize: Math.floor(totalTrainingSize / 5)  // 평균 학습 크기 계산
      }

      setPredictionHistory([newPrediction, ...predictionHistory])
      setProgress(null)
    } catch (error) {
      console.error('번호 생성 중 오류 발생:', error)
      setProgress(null)
    }
  }
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 py-12 px-4 sm:px-6 lg:px-8 text-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto"
      >

        <h1 className="text-5xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-pink-400 mb-2">
          LottoGPT
        </h1>
        <p className="text-xl text-center text-blue-200 mb-2">AI 기반 로또 번호 생성기</p>
        <p className="text-sm text-center text-blue-300/80 mb-12">
          최근 200회의 당첨번호를 기반으로 학습하여 최적의 로또번호를 예측합니다.
        </p>

        <motion.div
          className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-xl shadow-2xl p-8 mb-12"
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
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
              <h2 className="text-3xl font-bold text-blue-300 mb-6">예측 이력</h2>
              <div className="space-y-6">
                {predictionHistory.map((history) => (
                  <motion.div
                    key={history.id}
                    className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-xl p-6"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm text-blue-300">{history.date}</span>
                      <span className="text-sm font-medium text-purple-300">
                        학습 데이터: {history.trainingSize}회차
                      </span>
                    </div>
                    <div className="space-y-4">
                      {history.numbers.map((set, setIndex) => (
                        <div
                          key={setIndex}
                          className="flex items-center space-x-4 p-4 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-lg"
                        >
                          <span className="text-sm font-medium text-blue-300 w-20">SET {setIndex + 1}</span>
                          <div className="numbers">
                            {set.map((num) => (
                              <motion.span
                                key={num}
                                className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold ${
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

      <footer className="text-center text-sm text-gray-400 mt-8">
        © 2025 LottoGPT 본 서비스는 참고용이며, 실제 당첨을 보장하지 않습니다.
      </footer>
    </main>
  )
}