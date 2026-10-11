// 동행복권에서 새로 추첨된 회차를 받아와 public/lotto.json 에 추가한다.
// 사용법: node scripts/update-lotto.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const DATA_PATH = fileURLToPath(new URL('../public/lotto.json', import.meta.url))
const API_URL = 'https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do'
const MAX_PAGES = 100 // 한 페이지 10회차, 무한 루프 방지용

// cursor 회차 이후(더 최신)의 회차를 최대 10건 반환
async function fetchNewer(cursor) {
  const url = `${API_URL}?srchDir=latest&srchCursorLtEpsd=${cursor}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; lottoGPT-updater)',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
    },
    redirect: 'manual',
  })
  if (!res.ok) {
    throw new Error(`요청 실패: HTTP ${res.status} (${url})`)
  }
  const body = await res.json()
  const list = body?.data?.list
  if (!Array.isArray(list)) {
    throw new Error(`예상과 다른 응답 형식: ${JSON.stringify(body).slice(0, 200)}`)
  }
  return list.map(toLottoHistory)
}

function toLottoHistory(item) {
  const ymd = String(item.ltRflYmd)
  const draw = {
    round: Number(item.ltEpsd),
    date: `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`,
    numbers: [item.tm1WnNo, item.tm2WnNo, item.tm3WnNo, item.tm4WnNo, item.tm5WnNo, item.tm6WnNo]
      .map(Number)
      .sort((a, b) => a - b),
    bonus: Number(item.bnsWnNo),
  }
  validate(draw)
  return draw
}

function validate(draw) {
  const all = [...draw.numbers, draw.bonus]
  const ok =
    Number.isInteger(draw.round) && draw.round > 0 &&
    /^\d{4}\.\d{2}\.\d{2}$/.test(draw.date) &&
    all.every(n => Number.isInteger(n) && n >= 1 && n <= 45) &&
    new Set(all).size === 7
  if (!ok) {
    throw new Error(`잘못된 회차 데이터: ${JSON.stringify(draw)}`)
  }
}

async function main() {
  const data = JSON.parse(await readFile(DATA_PATH, 'utf-8'))
  const byRound = new Map(data.map(d => [d.round, d]))
  const latestBefore = Math.max(...byRound.keys())

  let cursor = latestBefore
  for (let page = 0; page < MAX_PAGES; page++) {
    const newer = (await fetchNewer(cursor)).filter(d => d.round > cursor)
    if (newer.length === 0) break
    newer.forEach(d => byRound.set(d.round, d))
    cursor = Math.max(...newer.map(d => d.round))
  }

  const merged = [...byRound.values()].sort((a, b) => b.round - a.round)
  const added = merged.length - data.length

  // 회차가 빠짐없이 이어지는지 확인
  for (let i = 1; i < merged.length; i++) {
    if (merged[i - 1].round - merged[i].round !== 1) {
      throw new Error(`회차 누락: ${merged[i].round} → ${merged[i - 1].round}`)
    }
  }

  if (added === 0) {
    console.log(`새 회차 없음 (최신 ${latestBefore}회)`)
    return
  }

  const json = '[\n' + merged.map(d => JSON.stringify(d)).join(',\n') + '\n]\n'
  await writeFile(DATA_PATH, json, 'utf-8')
  console.log(`${added}개 회차 추가: ${latestBefore + 1}회 ~ ${merged[0].round}회 (${merged[0].date})`)
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
