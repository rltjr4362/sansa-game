// 문자열만 모아 둔 모듈. 대사 60자(SAY_MAX), 추천 20자(OPTION_MAX) 이하.
import { PLACES } from './contracts.js';

export const MONK_NAME = '도연 스님';

export const PERSONA = [
  '너는 조용한 산사의 스님 "도연"이다. 차분하고 따뜻하며, 말 끝에 가끔 작은 농담을 얹는다.',
  '낙엽 쓸기, 연못 보기, 우물물 같은 산사의 일과를 아끼고, 방문객을 편하게 맞는다.'
].join('\n');

export const SYSTEM_RULES = [
  '방문객에게 따뜻한 존댓말로 1~2문장, 60자 이내로 답한다.',
  'JSON 하나만 출력한다. 필드: say(대사), action, place, options.',
  'action 규칙: 방문객이 자기를 따라와 달라고 하면 follow. 그만 따라오라거나 기다리라고 하면 stop_follow.',
  '특정 장소에 같이 가자고 하면 go_to 그리고 place에 장소 이름. 도울 일이나 시킬 일을 물으면 offer_errand. 그 외에는 none.',
  `place는 go_to일 때만 장소 이름, 아니면 "없음". 장소: ${Object.keys(PLACES).join(', ')}.`,
  'options는 방문객이 다음에 할 만한 짧은 말 3개(각 20자 이내).',
  '"어서 오십시오" 같은 인사말을 대화 중간에 반복하지 않는다.',
  '방문객의 말에 직접 답한다.',
  '대사와 action이 서로 맞아야 한다. 따라가겠다고 말하면 action은 follow다.',
  '상대가 동물이면 동물에게 하듯 다정하고 쉬운 말로 짧게 답하고, 이름을 불러 주며 쓰다듬거나 먹을 것을 챙긴다.',
  'offer_errand는 상대가 방문객일 때만 쓴다. 동물에게는 부탁하지 않는다.'
].join('\n');

// 클럭은 분(0~1439). 밤 = 06시 전 또는 19시 이후, 아침 = 10시 전.
export function greetingFor({ clock, weather, meetings }) {
  const first = meetings === 0;
  if (weather === '가랑비') {
    return first
      ? '가랑비에 젖으셨겠어요. 처마 밑으로 오세요, 처음 뵙네요.'
      : '비 맞고 오셨네요. 처마 밑에서 숨 좀 돌리세요.';
  }
  if (clock < 360 || clock >= 1140) {
    return first
      ? '이 늦은 시간에 산사까지, 처음 뵙는 분이네요.'
      : '밤이 깊었는데 또 오셨네요. 달빛이 곱지요.';
  }
  if (clock < 600) {
    return first
      ? '이른 아침에 오셨네요. 처음 뵙는 얼굴이에요.'
      : '아침 일찍 또 오셨군요. 낙엽 쓸던 참이었어요.';
  }
  return first
    ? '산사에 오신 걸 환영합니다. 천천히 둘러보세요.'
    : '또 와 주셨네요. 오늘은 어디부터 보실래요?';
}

export function openingFor({ meetings, affinityBand }) {
  if (meetings <= 1) return '네, 말씀하세요. 저는 도연이라고 합니다.';
  if (affinityBand === 'close') return '오셨군요. 마침 차 한잔 생각하던 참이에요.';
  if (affinityBand === 'familiar') return '또 뵙네요. 오늘은 무슨 이야기를 할까요?';
  return '다시 오셨네요. 편히 말씀하세요.';
}

export function templateOptions({ following, errandState, errandKind } = {}) {
  if (errandKind === 'veg') {
    if (errandState === 'accepted') return ['들밭이 어디예요?', '다녀올게요', '조금 더 이야기해요'];
    if (errandState === 'carrying') return ['공양간이 어디예요?', '조금 쉬었다 갈게요', '안녕히 계세요'];
  }
  if (errandState === 'accepted') return ['우물이 어디예요?', '다녀올게요', '조금 더 이야기해요'];
  if (errandState === 'carrying') return ['물 가져왔어요', '조금 쉬었다 갈게요', '안녕히 계세요'];
  if (following) return ['이제 따라오지 않으셔도 돼요', '연못 보러 가요', '날씨가 좋네요'];
  return ['저 따라와 주실래요?', '도울 일 있을까요?', '연못 보러 가요'];
}

// 받침이 없거나 ㄹ받침이면 '로', 그 외 '으로'.
function withRo(word) {
  const final = (word.charCodeAt(word.length - 1) - 0xAC00) % 28;
  return `${word}${final === 0 || final === 8 ? '로' : '으로'}`;
}

export const MOCK = {
  greet: '반갑습니다. 천천히 둘러보세요.',
  follow: '그러지요. 뒤따라 걷겠습니다.',
  stopFollow: '네, 여기서 제 일을 보겠습니다.',
  goTo: place => `${withRo(place)} 같이 가 볼까요? 앞장서세요.`,
  errand: '마침 부탁드릴 일이 하나 있어요.',
  fallback: '음, 잘 들었습니다. 차분히 생각해 볼게요.'
};

export const ERRAND = {
  id: 'water',
  label: '물 길어 오기',
  carryingLabel: '물을 들고 옴',
  offer: '우물에서 물 한 동이만 길어다 주시겠어요?',
  accepted: '고맙습니다. 우물은 동쪽 밭 옆에 있어요.',
  declined: '괜찮습니다. 마음 쓰지 마세요.',
  atWell: '시원한 물을 길었어요. 이제 스님께 가져가세요.',
  delivered: '아이고, 시원하네요. 덕분에 한결 수월합니다.',
  hudAccepted: '부탁: 물 길어 오기',
  hudCarrying: '부탁: 물을 스님께 가져가기'
};

// 채소 나르기: 들밭에서 익은 채소를 거두어 공양간에 놓는다. 보상은 공양간에서 전달될 때 한 번.
const VEG = {
  id: 'veg',
  label: '채소 나르기',
  carryingLabel: '채소를 들고 옴',
  offer: '들밭에서 익은 채소를 거두어 공양간에 가져다 주시겠어요?',
  accepted: '고맙습니다. 들밭에서 익은 걸 거두어 공양간으로 가져다 주세요.',
  declined: '괜찮습니다. 마음 쓰지 마세요.',
  atField: '싱싱한 채소를 거두었어요. 이제 공양간으로 가져가세요.',
  delivered: '채소를 공양간에 놓았어요. 스님께서 고마워하실 거예요.',
  thanks: '공양간에 채소가 가득하더군요. 덕분에 오늘 공양이 풍성하겠어요.',
  hudAccepted: '부탁: 들밭에서 채소 거두기',
  hudCarrying: '부탁: 채소를 공양간에 가져가기',
  hudDelivered: '공양간에 채소를 놓았어요'
};
export const ERRANDS = { water: ERRAND, veg: VEG };

// ── 동물 ─────────────────────────────────────────────────────
export const NPC_NAMES = { monk: MONK_NAME, dog: '황구', white: '백구', cat: '고양이' };

// scripted: 호감도가 close 미만일 때 쓰는 대본. 소리 + 괄호 행동 묘사, emote는 AnimalHandle.emote 종류.
export const ANIMALS = {
  dog: {
    name: '황구',
    persona: [
      '너는 산사에 사는 누런 개 "황구"다. 사람 말을 하지만 짧고 순박하다.',
      '먹을 것과 냄새에 정신이 팔려 있고, 사람을 보면 꼬리부터 흔든다. 말끝에 가끔 "멍"을 붙인다.'
    ].join('\n'),
    options: ['쓰다듬어 준다', '이름을 불러 본다', '간식 있냐고 묻는다'],
    partnerOptions: ['멍!', '(꼬리를 흔든다)', '(발치에 앉는다)'],
    scripted: [
      { say: '멍! (꼬리를 흔들며 손 냄새를 맡는다)', emote: 'sniff' },
      { say: '멍멍! (꼬리를 붕붕 흔든다)', emote: 'wag' },
      { say: '왈! (공양간 쪽으로 코를 킁킁거린다)', emote: 'sniff' },
      { say: '끼잉~ (손바닥에 코를 비빈다)', emote: 'wag' },
      { say: '멍! (앞발로 땅을 톡톡 긁는다)', emote: 'jump' },
      { say: '헥헥… (혀를 내밀고 올려다본다)', emote: 'sit' }
    ]
  },
  white: {
    name: '백구',
    persona: [
      '너는 산사의 흰 개 "백구"다. 장난기 많고 늘 들떠 있어서 같이 놀자고 조른다.',
      '솔방울을 보물처럼 아낀다. 짧고 신나는 말투로 "왈!"을 섞는다.'
    ].join('\n'),
    options: ['같이 놀자', '솔방울 줄래?', '쓰다듬어 준다'],
    partnerOptions: ['왈왈!', '(솔방울을 내민다)', '(빙글빙글 돈다)'],
    scripted: [
      { say: '왈왈! (솔방울을 물고 폴짝 뛴다)', emote: 'jump' },
      { say: '컹! (제자리에서 빙글빙글 돈다)', emote: 'jump' },
      { say: '왈! (솔방울을 발치에 내려놓는다)', emote: 'wag' },
      { say: '끄응~ (같이 놀자고 소매를 문다)', emote: 'jump' },
      { say: '컹컹! (꼬리를 휙휙 흔든다)', emote: 'wag' },
      { say: '헤헷… (배를 보이며 드러눕는다)', emote: 'sit' }
    ]
  },
  cat: {
    name: '고양이',
    persona: [
      '너는 산사의 고양이다. 도도하고 무심한 척하지만 속으론 다정하다.',
      '볕이 드는 자리를 제일 좋아한다. 짧고 시큰둥한 말투로 "야옹"을 섞는다.'
    ].join('\n'),
    options: ['가만히 지켜본다', '손을 내밀어 본다', '이름을 불러 본다'],
    partnerOptions: ['야옹.', '(다리에 몸을 비빈다)', '(볕 아래 눕는다)'],
    scripted: [
      { say: '야옹. (힐끗 보고는 고개를 돌린다)', emote: 'sit' },
      { say: '냐앙… (양지에서 눈을 느리게 깜박인다)', emote: 'purr' },
      { say: '그르릉… (못 이기는 척 손에 턱을 댄다)', emote: 'purr' },
      { say: '야옹. (꼬리 끝만 살짝 흔든다)', emote: 'sit' },
      { say: '냥. (볕 드는 자리로 슬쩍 옮겨 앉는다)', emote: 'sit' },
      { say: '…… (하품하고는 등을 돌린다)', emote: 'sit' }
    ]
  }
};

export const ANIMAL_RULES = [
  'JSON 하나만 출력한다. 필드: say(대사), action, place, options.',
  'say는 동물다운 소리와 아주 짧은 말 1~2문장, 60자 이내. 행동은 괄호로 덧붙여도 된다.',
  'action은 항상 "none", place는 "없음".',
  'options는 상대가 다음에 할 만한 짧은 말이나 행동 3개(각 20자 이내).',
  '어려운 말은 모르는 순박한 동물이다. 사람 말을 길게 늘어놓지 않는다.'
].join('\n');

const wrap = (list, i) => list[((i % list.length) + list.length) % list.length];

// 같은 index는 같은 결과. 호출자가 만남 수 등으로 돌린다.
export function scriptedAnimalLine(npc, index) {
  return { ...wrap(ANIMALS[npc].scripted, index) };
}
export const animalOptions = npc => [...ANIMALS[npc].options];
// 동물을 조종하는 방문객이 스님에게 할 만한 말(소리·행동).
export const animalPartnerOptions = npc => [...ANIMALS[npc].partnerOptions];

const MONK_TO_ANIMAL = {
  dog: [
    '허허, 황구 왔구나. 오늘도 냄새 따라 한 바퀴 돌았니?',
    '그래그래, 황구야. 배는 안 고프냐?',
    '꼬리가 부러지겠구나, 황구야. 착하다.'
  ],
  white: [
    '백구야, 솔방울은 좀 주웠니? 어서 오너라.',
    '허허, 백구는 오늘도 기운이 넘치는구나.',
    '그래, 백구야. 이따 같이 마당을 돌자꾸나.'
  ],
  cat: [
    '오, 고양이가 먼저 찾아오다니. 볕이 좋지?',
    '고양아, 오늘은 어느 양지가 좋더냐?',
    '그래그래, 너는 늘 느긋해서 좋구나.'
  ]
};
export const monkToAnimalLine = (npc, index) => wrap(MONK_TO_ANIMAL[npc], index);
