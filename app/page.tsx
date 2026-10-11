'use client'
import { Fragment, useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from "framer-motion"
import Script from 'next/script';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PieChart, Pie, Cell, Legend } from 'recharts';
import {
  type LottoHistory,
  type LottoStats,
  RANGE_TREND_SIZE,
  calculateStats,
  checkWinning,
  generateSets,
  getBallClass,
  getDrawDate,
  getNumberColor,
  getTargetRound,
  predictProbabilities,
  toNumberKey,
  trainModels,
} from '@/lib/lotto'

const SET_COUNT = 5;
const MAX_SAVED_HISTORY = 10; // 몇 주 뒤에도 당첨 확인을 할 수 있도록 넉넉히 보관

// 번호 생성 연출 시간: 준비 0.8초 + 학습(회차 수에 비례, 30회 약 1.6초 ~ 200회 약 5초)
// + 추출(번호 30개 x 0.12초 + 세트 간 0.25초 x 5) + 완료 0.6초
const PREPARE_DELAY_MS = 800;
const TRAIN_BASE_MS = 1000;
const TRAIN_MS_PER_ROUND = 20;
const BALL_REVEAL_DELAY_MS = 120;
const SET_PAUSE_MS = 250;
const DONE_DELAY_MS = 600;

const DHLOTTERY_URL = 'https://www.dhlottery.co.kr/';
const DHLOTTERY_RESULT_URL = 'https://www.dhlottery.co.kr/lt645/result';

const GENERATION_STAGES = [
  { stage: '데이터 준비', label: '데이터 준비' },
  { stage: '학습', label: 'AI 학습' },
  { stage: '번호 생성', label: '번호 추출' },
] as const;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface GenerationProgress {
  stage: typeof GENERATION_STAGES[number]['stage'];
  current: number;
  total: number;
  detail?: string;
  sets?: number[][]; // 번호 추출 단계에서 지금까지 공개된 번호 (세트별)
}

interface PredictionHistoryItem {
  id: number;
  date: string;
  numbers: number[][];
  trainingSize: number;
}

export default function Home() {
  const [historicalData, setHistoricalData] = useState<LottoHistory[]>([])
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistoryItem[]>([]);
  const [lottoStats, setLottoStats] = useState<LottoStats | null>(null);
  const [maxTrainingSize, setMaxTrainingSize] = useState<number>(30);

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
      localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory.slice(0, MAX_SAVED_HISTORY)));
    }
  }, [predictionHistory]);

  const loadLottoHistory = async () => {
    try {
      // scripts/update-lotto.mjs 가 매주 갱신하는 데이터 (최신 회차가 앞쪽)
      const response = await fetch('/lotto.json', { cache: 'no-cache' })
      if (!response.ok) {
        console.error('로또 데이터를 불러올 수 없습니다:', response.status)
        return
      }
      const jsonData: unknown = await response.json()

      if (!Array.isArray(jsonData)) {
        console.error('로또 데이터 형식이 올바르지 않습니다.')
        return
      }

      const formattedData = jsonData
        .filter((item): item is LottoHistory => {
          const valid = typeof item?.round === 'number' && typeof item?.date === 'string' &&
            Array.isArray(item?.numbers) && item.numbers.length === 6 && typeof item?.bonus === 'number'
          if (!valid) console.error('잘못된 데이터 형식:', item)
          return valid
        })
        .sort((a, b) => b.round - a.round)

      if (formattedData.length === 0) {
        console.error('유효한 데이터가 없습니다.')
        return
      }

      setHistoricalData(formattedData)
    } catch (error) {
      console.error('로또 데이터 로드 중 오류 발생:', error)
    }
  }

  const generateNumbers = async () => {
    if (historicalData.length < 2) return;

    try {
      // 최근 maxTrainingSize 회차의 (이전 회차 → 다음 회차) 쌍으로 학습
      const trainingData = historicalData.slice(0, maxTrainingSize + 1);
      const trainingSize = trainingData.length - 1;

      // 실제 연산은 1초 미만이지만, 기다리는 재미를 위해 단계별로 연출 시간을 둔다.
      setProgress({ stage: '데이터 준비', current: 0, total: 100, detail: `최근 ${trainingSize}회차 당첨번호 불러오는 중...` });
      await sleep(PREPARE_DELAY_MS);

      // 학습 데이터가 많을수록 학습 단계가 길어지도록 연출
      const trainStepDelay = (TRAIN_BASE_MS + trainingSize * TRAIN_MS_PER_ROUND) / 45;
      const models = await trainModels(trainingData, async trained => {
        setProgress({ stage: '학습', current: trained, total: 45, detail: `최근 ${trainingSize}회차로 번호별 AI 모델 학습 중 (${trained}/45)` });
        await sleep(trainStepDelay);
      });

      const probabilities = predictProbabilities(models, historicalData[0]);
      const sets = generateSets(probabilities, SET_COUNT);

      // 추출한 번호를 진행 영역에서 한 개씩 공개
      const revealed: number[][] = sets.map(() => []);
      const totalBalls = sets.length * 6;
      for (let i = 0; i < sets.length; i++) {
        for (let j = 0; j < sets[i].length; j++) {
          revealed[i] = sets[i].slice(0, j + 1);
          setProgress({
            stage: '번호 생성',
            current: i * 6 + j + 1,
            total: totalBalls,
            detail: `${historicalData[0].round}회 당첨번호를 입력해 SET ${i + 1} 번호를 추출하고 있습니다`,
            sets: revealed.map(set => [...set]),
          });
          await sleep(BALL_REVEAL_DELAY_MS);
        }
        await sleep(SET_PAUSE_MS);
      }
      setProgress({ stage: '번호 생성', current: totalBalls, total: totalBalls, detail: '추출 완료! 예측 이력에 저장합니다', sets });
      await sleep(DONE_DELAY_MS);

      const prediction: PredictionHistoryItem = {
        id: Date.now(),
        date: new Date().toLocaleString('ko-KR'),
        numbers: sets,
        trainingSize,
      };
      setPredictionHistory(prev => [prediction, ...prev]);
    } catch (error) {
      console.error('번호 생성 중 오류 발생:', error);
    } finally {
      setProgress(null);
    }
  };

  useEffect(() => {
    if (historicalData.length > 0) {
      setLottoStats(calculateStats(historicalData));
    }
  }, [historicalData]);

  const clearPredictionHistory = () => {
    setPredictionHistory([]);
    localStorage.removeItem('predictionHistory');
  };

  // 예측번호와 기존 당첨번호 비교용 (번호 조합 → 회차)
  const winningRoundByKey = useMemo(
    () => new Map(historicalData.map(history => [toNumberKey(history.numbers), history.round])),
    [historicalData]
  );

  // 예측 이력 당첨 확인용 (회차 → 당첨번호)
  const drawByRound = useMemo(
    () => new Map(historicalData.map(history => [history.round, history])),
    [historicalData]
  );

  const generateShareText = (prediction: PredictionHistoryItem) => {
    const sets = prediction.numbers.map((set, index) =>
      `${index + 1}세트: ${set.join(', ')}`
    ).join('\n');

    return `🎯 LottoGPT AI가 예측한 로또번호\n\n${sets}\n\n` +
      `🤖 AI가 최근 ${prediction.trainingSize}회차의 당첨번호를 학습해 뽑은 번호입니다.\n` +
      `✨ 당신의 행운을 기원합니다!\n\n` +
      `🌐 LottoGPT: https://lottogpt.netlify.app`;
  };

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

  // 학습 데이터 슬라이더(30~200)에서 선택한 값의 위치(%)
  const trainingSizePercent = ((maxTrainingSize - 30) / (200 - 30)) * 100;

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

        <h1 className="font-brand text-5xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-pink-400 mb-2 whitespace-nowrap">
          LottoGPT
        </h1>
        <p className="text-xl text-center text-blue-200 mb-2 whitespace-nowrap">
          AI 기반 로또 번호 생성기
        </p>
        <p className="text-sm text-center text-blue-300/80 mb-2 whitespace-normal">
          최근 당첨번호를 AI가 학습해 번호별 출현 확률을 계산하고, 그 확률에 따라 번호를 추출합니다.
        </p>
        <p className="text-xs text-center text-blue-300/60 mb-12 whitespace-normal">
          {historicalData.length > 0
            ? `최신 데이터: ${historicalData[0].round}회 (${historicalData[0].date} 추첨)`
            : ' '}
        </p>

        <div className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-xl shadow-2xl p-5 sm:p-8 mb-12">
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
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500"
              // 선택한 값만큼 막대를 채워서 표시 (브라우저 기본 채움 표시에 의존하지 않음)
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #a855f7 ${trainingSizePercent}%, #1e3a8a ${trainingSizePercent}%)`
              }}
            />
            <div className="flex justify-between text-xs text-blue-300 mt-1">
              <span className="whitespace-nowrap">최소 30회차</span>
              <span className="whitespace-nowrap">최대 200회차</span>
            </div>
          </div>

          <button
            onClick={generateNumbers}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white text-lg font-bold py-4 px-6 rounded-lg transition duration-300 ease-in-out transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 shadow-lg disabled:cursor-not-allowed disabled:hover:scale-100 disabled:opacity-80"
            disabled={!!progress || historicalData.length < 2}
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

          <a
            href={DHLOTTERY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-3 px-6 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-blue-100 text-sm font-medium transition-colors duration-200"
          >
            동행복권 바로가기
            <ExternalLinkIcon />
          </a>

          {progress && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
              <GenerationSteps stage={progress.stage} />

              {progress.sets ? (
              <ExtractionPanel detail={progress.detail} sets={progress.sets} />
              ) : (
              <>
              <h3 className="text-lg font-semibold text-blue-300 mb-2">
                {GENERATION_STAGES.find(item => item.stage === progress.stage)?.label}
              </h3>
              <p className="text-sm text-blue-200 mb-2">{progress.detail}</p>

              {/* 로딩 애니메이션 */}
              <div className="flex justify-center mb-4">
                <div className="flex gap-2">
                  {[...Array(6)].map((_, index) => {
                    const randomNum = Math.floor(Math.random() * 45) + 1;
                    return (
                      <motion.div
                        key={index}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${getBallClass(randomNum)}`}
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
              </>
              )}

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
        </div>

        <AnimatePresence>
          {predictionHistory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-xl shadow-2xl p-5 sm:p-8"
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
                    className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-xl p-3 sm:p-4"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* 날짜·학습 데이터(왼쪽) + 공유 버튼(오른쪽), 아래에 당첨 결과 요약 */}
                    <div className="flex flex-col gap-3 mb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-blue-300">{history.date}</span>
                          <span className="text-xs font-medium text-purple-300">
                            학습 데이터: {history.trainingSize}회차
                          </span>
                        </div>
                        <button
                          onClick={() => handleShare(history)}
                          className="shrink-0 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition-colors duration-200 flex items-center gap-1.5 text-sm"
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
                      <WinningSummary targetRound={getTargetRound(history.id)} draw={drawByRound.get(getTargetRound(history.id))} sets={history.numbers} />
                    </div>
                    <div className="space-y-3">
                      {history.numbers.map((set, setIndex) => {
                        const targetDraw = drawByRound.get(getTargetRound(history.id));
                        const result = targetDraw ? checkWinning(set, targetDraw) : null;
                        return (
                        <div key={setIndex} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 sm:p-3 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-lg">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-blue-300">SET {setIndex + 1}</span>
                              {result && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                  result.rank ? 'bg-yellow-400 text-yellow-900' : 'bg-white/10 text-blue-200/80'
                                }`}>
                                  {result.rank ? `${result.rank}등 당첨` : `낙첨 (${result.matched.length}개 일치)`}
                                </span>
                              )}
                            </div>
                            {/* 당첨번호 일치 시 메시지를 SET 라벨 아래에 표시 */}
                            {winningRoundByKey.has(toNumberKey(set)) && (
                              <span className="text-xs text-yellow-400 font-medium">
                                {winningRoundByKey.get(toNumberKey(set))}회차 당첨번호와 동일
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center sm:justify-end w-full sm:w-auto">
                            {set.map((num) => {
                              // 추첨 결과가 있으면 맞힌 번호는 강조, 나머지는 흐리게 표시
                              const isMatched = result?.matched.includes(num);
                              const isBonus = result?.rank === 2 && targetDraw?.bonus === num;
                              return (
                              <div key={num} className="relative flex flex-col items-center">
                                <motion.span
                                  className={`inline-flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full text-sm sm:text-base font-bold ${getBallClass(num)} ${
                                    result && !isMatched && !isBonus ? 'opacity-30' : ''
                                  } ${isMatched || isBonus ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent' : ''}`}
                                  whileHover={{ scale: 1.1 }}
                                  transition={{ type: "spring", stiffness: 300 }}
                                >
                                  {num}
                                </motion.span>
                                {isBonus && <span className="text-[10px] text-yellow-300 mt-1">보너스</span>}
                              </div>
                              );
                            })}
                          </div>
                        </div>
                        );
                      })}
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
          <div className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-xl shadow-2xl p-5 sm:p-8">
            <h2 className="text-3xl font-bold text-blue-300 mb-6">당첨 번호 통계</h2>

            {/* 자주 등장하는 번호 패턴을 최상단으로 이동 */}
            {lottoStats.duplicatePatterns.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-blue-200 mb-4">자주 등장하는 번호 패턴</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white bg-opacity-5 rounded-xl p-3 sm:p-4">
                  {lottoStats.duplicatePatterns.map((pattern, index) => (
                    <div key={index} className="p-3 bg-white bg-opacity-5 rounded-lg">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {pattern.numbers.map((num) => (
                          <span
                            key={num}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getBallClass(num)}`}
                          >
                            {num}
                          </span>
                        ))}
                      </div>
                      <div className="text-sm text-blue-300">
                        <span className="font-semibold">{pattern.count}회 등장</span>
                        <span className="ml-2 text-blue-200/80">
                          (최근: {pattern.rounds.slice(-3).reverse().join(', ')}회차)
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="sm:col-span-2 text-xs text-blue-300/80 mt-1 text-center">
                    * 3개 숫자 조합 기준, 가장 자주 등장한 상위 10개 패턴
                  </div>
                </div>
              </div>
            )}

            {/* 기존 번호별 출현 빈도 그래프 */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-blue-200 mb-1">번호별 출현 빈도 그래프</h3>
              <p className="text-sm text-blue-200/80 mb-4">
                {lottoStats.firstRound}회 ~ {lottoStats.latestRound}회 기준
              </p>
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
                      {Object.keys(lottoStats.frequency).map((num) => (
                        <Cell key={`cell-${num}`} fill={getNumberColor(Number(num))} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 번호대별 출현 빈도 차트 */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-blue-200 mb-4">최근 {RANGE_TREND_SIZE}회 번호대별 출현 빈도</h3>
              <div className="w-full h-[300px] bg-white bg-opacity-5 rounded-xl p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={lottoStats.rangeCounts}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <XAxis
                      dataKey="label"
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
                      {lottoStats.rangeCounts.map((range) => (
                        <Cell key={`cell-${range.label}`} fill={range.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-4">
                <span className="text-sm text-blue-200">
                  * 최근 {RANGE_TREND_SIZE}회차의 당첨번호를 분석한 결과입니다.
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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
                    {lottoStats.consecutiveDraws}회 ({lottoStats.consecutiveRate}%)
                  </div>
                  <div className="text-sm text-blue-200">연속 번호가 포함된 회차</div>
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
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${getBallClass(num)}`}
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
        © {new Date().getFullYear()} LottoGPT 본 서비스는 참고용이며, 실제 당첨을 보장하지 않습니다.
      </footer>
    </main>
  )
}
// 예측 이력 한 건의 대상 회차와 당첨 결과 요약
function WinningSummary({ targetRound, draw, sets }: {
  targetRound: number;
  draw?: LottoHistory;
  sets: number[][];
}) {
  if (!draw) {
    return (
      <span className="text-sm text-blue-200/80">
        {targetRound}회 ({getDrawDate(targetRound)} 추첨) 결과 대기 중
      </span>
    );
  }

  const ranks = sets.map(set => checkWinning(set, draw).rank).filter((rank): rank is number => rank !== null);
  const bestRank = ranks.length > 0 ? Math.min(...ranks) : null;

  return (
    <div className="flex flex-col gap-2 p-2.5 sm:p-3 bg-white/5 rounded-lg">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-blue-200">{draw.round}회 ({draw.date}) 결과</span>
        <span className={`font-bold ${bestRank ? 'text-yellow-300' : 'text-blue-200/80'}`}>
          {bestRank ? `${ranks.length}세트 당첨 · 최고 ${bestRank}등` : '당첨 세트 없음'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {draw.numbers.map(num => (
          <span key={num} className={`inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-bold ${getBallClass(num)}`}>
            {num}
          </span>
        ))}
        <span className="text-blue-200 mx-1">+</span>
        <span className={`inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-bold ${getBallClass(draw.bonus)}`}>
          {draw.bonus}
        </span>
      </div>
      <a
        href={DHLOTTERY_RESULT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start flex items-center gap-1 text-xs text-blue-200/80 hover:text-white underline-offset-2 hover:underline"
      >
        동행복권에서 결과 보기
        <ExternalLinkIcon />
      </a>
    </div>
  );
}

// 외부 링크(새 창) 표시 아이콘
function ExternalLinkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

// 번호 생성 진행 단계 표시 (데이터 준비 → AI 학습 → 번호 추출)
function GenerationSteps({ stage }: { stage: GenerationProgress['stage'] }) {
  const currentIndex = GENERATION_STAGES.findIndex(item => item.stage === stage);
  return (
    <div className="flex items-start justify-center gap-2 mb-5">
      {GENERATION_STAGES.map((item, index) => (
        <Fragment key={item.stage}>
          {index > 0 && (
            <div className={`mt-3 h-0.5 w-6 sm:w-12 rounded transition-colors duration-500 ${
              index <= currentIndex ? 'bg-purple-400' : 'bg-white/20'
            }`} />
          )}
          <div className="flex flex-col items-center gap-1 w-16">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-500 ${
              index < currentIndex
                ? 'bg-purple-500 text-white'
                : index === currentIndex
                  ? 'bg-yellow-400 text-yellow-900 animate-pulse'
                  : 'bg-white/10 text-white/50'
            }`}>
              {index < currentIndex ? '✓' : index + 1}
            </span>
            <span className={`text-xs whitespace-nowrap ${index === currentIndex ? 'text-white font-semibold' : 'text-blue-200/70'}`}>
              {item.label}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// 학습이 끝난 뒤 번호를 한 개씩 추출해 보여주는 영역
function ExtractionPanel({ detail, sets }: { detail?: string; sets: number[][] }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mb-4 rounded-xl border border-yellow-300/40 bg-gradient-to-br from-yellow-400/10 via-purple-500/10 to-pink-500/10 p-4 shadow-[0_0_30px_rgba(250,204,21,0.15)]"
    >
      <p className="text-center text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-pink-300 mb-1">
        ✨ 학습 완료! AI가 번호를 추출하고 있습니다
      </p>
      <p className="text-center text-xs sm:text-sm text-blue-200 mb-4">{detail}</p>
      <div className="space-y-2">
        {sets.map((set, setIndex) => (
          <div
            key={setIndex}
            className={`flex items-center justify-center gap-2 transition-opacity duration-300 ${set.length === 0 ? 'opacity-40' : ''}`}
          >
            <span className="w-11 shrink-0 whitespace-nowrap text-xs font-medium text-blue-300">SET {setIndex + 1}</span>
            <div className="flex gap-1 sm:gap-1.5">
              {Array.from({ length: 6 }, (_, ballIndex) => {
                const num = set[ballIndex];
                return num ? (
                  <motion.span
                    key={`ball-${ballIndex}`}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${getBallClass(num)}`}
                  >
                    {num}
                  </motion.span>
                ) : (
                  <span
                    key={`empty-${ballIndex}`}
                    className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs border border-dashed border-white/30 text-white/40"
                  >
                    ?
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
