'use client'
// 동행복권에서 예측 번호를 직접 입력할 때 보고 따라 누르기 쉽게 보여주는 구매 도우미.
// 동행복권 페이지를 조작하지 않고, 번호판 배치(한 줄 7칸)만 같게 보여준다.
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getBallClass } from '@/lib/lotto'

const DHLOTTERY_MOBILE_BUY_URL = 'https://ol.dhlottery.co.kr/olotto/game_mobile/game645.do';
const DHLOTTERY_PC_BUY_URL = 'https://ol.dhlottery.co.kr/olotto/game/game645.do';

// Document Picture-in-Picture (PC 크롬/엣지): 다른 창 위에 항상 떠 있는 작은 창
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}
declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

export interface PurchaseSource {
  name: string;                              // 탭 이름 (예: "AI 번호")
  sets: { label: string; numbers: number[] }[];
}

interface Props {
  round: number;
  sources: PurchaseSource[];
  onClose: () => void;
}

// 현재 페이지의 스타일을 작은 창에 복사 (Tailwind/폰트 적용)
function copyStyles(target: Window) {
  [...document.styleSheets].forEach(sheet => {
    try {
      const style = target.document.createElement('style');
      style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
      target.document.head.appendChild(style);
    } catch {
      // 다른 출처의 스타일시트는 규칙을 읽을 수 없으므로 링크로 연결
      if (sheet.href) {
        const link = target.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  });
  target.document.body.className = document.body.className;
  target.document.body.style.margin = '0';
}

export default function PurchaseHelper({ round, sources, onClose }: Props) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState<boolean[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  const sets = sources[sourceIndex].sets;

  useEffect(() => {
    setIsMobile(window.matchMedia('(max-width: 767px), (pointer: coarse)').matches);
    setPipSupported(!!window.documentPictureInPicture);
  }, []);

  // ESC 로 닫기, 열려 있는 동안 뒤 페이지 스크롤 막기
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // 도우미를 닫으면 작은 창도 닫기
  useEffect(() => () => { pipWindow?.close(); }, [pipWindow]);

  const changeSource = (index: number) => {
    setSourceIndex(index);
    setCurrent(0);
    setDone([]);
  };

  const markDone = () => {
    setDone(prev => {
      const next = [...prev];
      next[current] = true;
      return next;
    });
    setCurrent(prev => Math.min(prev + 1, sets.length - 1));
  };

  const openPip = async () => {
    if (!window.documentPictureInPicture) return;
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 380, height: 720 });
      copyStyles(pip);
      pip.document.title = `${round}회 구매 도우미`;
      pip.addEventListener('pagehide', () => setPipWindow(null));
      setPipWindow(pip);
    } catch (error) {
      console.error('작은 창 열기 실패:', error);
    }
  };

  const content = (actions: ReactNode) => (
    <HelperContent
      round={round}
      sources={sources}
      sourceIndex={sourceIndex}
      onSourceChange={changeSource}
      sets={sets}
      current={current}
      onSelect={setCurrent}
      done={done}
      onDone={markDone}
      buyUrl={isMobile ? DHLOTTERY_MOBILE_BUY_URL : DHLOTTERY_PC_BUY_URL}
      actions={actions}
    />
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${round}회 구매 도우미`}
          className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl border border-white/10"
          onClick={e => e.stopPropagation()}
        >
          {pipWindow ? (
            <div className="bg-gradient-to-br from-indigo-950 via-purple-950 to-pink-950 text-white p-6 space-y-4 text-center">
              <p className="text-lg font-bold">작은 창에서 진행 중입니다</p>
              <p className="text-sm text-blue-200/80">동행복권 화면 위에 작은 창을 띄워두고 번호를 따라 눌러주세요.</p>
              <div className="flex gap-2 justify-center">
                <button type="button" onClick={() => pipWindow.close()} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm">
                  여기서 보기
                </button>
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm">
                  닫기
                </button>
              </div>
            </div>
          ) : (
            content(
              <>
                {pipSupported && !isMobile && (
                  <button type="button" onClick={openPip} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs whitespace-nowrap">
                    작은 창으로 띄우기
                  </button>
                )}
                <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/15 text-lg leading-none">
                  ×
                </button>
              </>
            )
          )}
        </div>
      </div>
      {pipWindow && createPortal(content(null), pipWindow.document.body)}
    </>
  );
}

function HelperContent({
  round, sources, sourceIndex, onSourceChange, sets, current, onSelect, done, onDone, buyUrl, actions,
}: {
  round: number;
  sources: PurchaseSource[];
  sourceIndex: number;
  onSourceChange: (index: number) => void;
  sets: PurchaseSource['sets'];
  current: number;
  onSelect: (index: number) => void;
  done: boolean[];
  onDone: () => void;
  buyUrl: string;
  actions: ReactNode;
}) {
  const set = sets[current];
  const doneCount = sets.filter((_, i) => done[i]).length;
  const allDone = doneCount === sets.length;

  return (
    <div className="min-h-full bg-gradient-to-br from-indigo-950 via-purple-950 to-pink-950 text-white p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">🛒 {round}회 구매 도우미</h2>
          <p className="text-xs text-blue-200/80">동행복권 번호판에서 같은 위치를 따라 눌러주세요</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
      </div>

      {sources.length > 1 && (
        <div className="flex gap-1.5">
          {sources.map((source, index) => (
            <button
              key={source.name}
              type="button"
              onClick={() => onSourceChange(index)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${
                index === sourceIndex ? 'bg-yellow-400 text-yellow-900' : 'bg-white/10 text-blue-200 hover:bg-white/15'
              }`}
            >
              {source.name}
            </button>
          ))}
        </div>
      )}

      {/* 세트 진행 상황 */}
      <div className="flex gap-1.5">
        {sets.map((item, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              index === current
                ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                : done[index] ? 'bg-green-500/80 text-white' : 'bg-white/10 text-blue-200'
            }`}
          >
            {done[index] ? '✓ ' : ''}{index + 1}
          </button>
        ))}
      </div>

      {/* 현재 세트 */}
      <div className="rounded-xl bg-white/10 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-blue-200">{set.label}</span>
          {done[current] && <span className="text-xs text-green-300">입력 완료</span>}
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {set.numbers.map(num => (
            <span key={num} className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-base font-bold ${getBallClass(num)}`}>
              {num}
            </span>
          ))}
        </div>
        {/* 동행복권과 같은 배치의 번호판 (한 줄 7칸) */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 45 }, (_, i) => i + 1).map(num => {
            const selected = set.numbers.includes(num);
            return (
              <span
                key={num}
                className={`aspect-square rounded-md flex items-center justify-center text-xs sm:text-sm font-bold ${
                  selected ? `${getBallClass(num)} ring-2 ring-white` : 'bg-white/5 text-white/30'
                }`}
              >
                {num}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSelect(Math.max(current - 1, 0))}
          disabled={current === 0}
          className="px-4 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm disabled:opacity-40"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex-1 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-sm font-bold hover:from-blue-600 hover:to-purple-700"
        >
          {current === sets.length - 1 ? '입력 완료' : '입력 완료 · 다음 세트'}
        </button>
      </div>

      {allDone && (
        <p className="rounded-lg bg-green-500/20 p-3 text-sm text-green-200 text-center">
          {sets.length}세트 입력 완료! 동행복권에서 구매 버튼을 눌러 결제를 마무리하세요.
        </p>
      )}

      <a
        href={buyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full py-3 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-center text-sm font-medium"
      >
        동행복권 구매 페이지 열기 ↗
      </a>

      <p className="text-[11px] leading-relaxed text-blue-200/70">
        * 동행복권 로그인 후 이용할 수 있으며, 인터넷 구매는 한 번에 최대 5게임(1주 5,000원 한도)입니다.
        자주 사는 번호는 동행복권의 &lsquo;나의 번호 저장&rsquo;에 등록해두면 다음부터 &lsquo;나만의 번호&rsquo;에서 바로 고를 수 있어요.
      </p>
    </div>
  );
}
