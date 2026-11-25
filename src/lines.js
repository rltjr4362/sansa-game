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
  '대사와 action이 서로 맞아야 한다. 따라가겠다고 말하면 action은 follow다.'
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

export function templateOptions({ following, errandState } = {}) {
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
  offer: '우물에서 물 한 동이만 길어다 주시겠어요?',
  accepted: '고맙습니다. 우물은 동쪽 밭 옆에 있어요.',
  declined: '괜찮습니다. 마음 쓰지 마세요.',
  atWell: '시원한 물을 길었어요. 이제 스님께 가져가세요.',
  delivered: '아이고, 시원하네요. 덕분에 한결 수월합니다.',
  hudAccepted: '부탁: 물 길어 오기',
  hudCarrying: '부탁: 물을 스님께 가져가기'
};
