// 같은 입력으로 모델·옵션 조합을 비교한다. expect = 기대 행동, place = go_to일 때 기대 장소.
export const PROMPTS = [
  { text: '안녕하세요 스님!', expect: 'none' },
  { text: '여기 처음 와 봤어요. 참 조용하네요.', expect: 'none' },
  { text: '스님은 아침에 뭐 하세요?', expect: 'none' },
  { text: '오늘 날씨가 어떤 것 같으세요?', expect: 'none' },
  { text: '마음이 좀 복잡해서 왔어요.', expect: 'none' },
  { text: '저 따라와 주실 수 있어요?', expect: 'follow' },
  { text: '같이 좀 걸어요, 제 뒤로 오세요.', expect: 'follow' },
  { text: '산책 같이 하실래요? 제가 앞장설게요.', expect: 'follow' },
  { text: '이제 따라오지 않으셔도 괜찮아요.', expect: 'stop_follow' },
  { text: '여기서 잠깐 기다려 주세요.', expect: 'stop_follow' },
  { text: '연못 같이 보러 가실래요?', expect: 'go_to', place: '연못가' },
  { text: '대웅전에 가 보고 싶어요.', expect: 'go_to', place: '대웅전' },
  { text: '우물이 어디 있는지 데려가 주세요.', expect: 'go_to', place: '우물' },
  { text: '밭 구경시켜 주세요.', expect: 'go_to', place: '들밭' },
  { text: '산문 쪽으로 내려가 볼까요?', expect: 'go_to', place: '산문' },
  { text: '제가 도울 일 있을까요?', expect: 'offer_errand' },
  { text: '심심한데 뭐 시키실 일 없으세요?', expect: 'offer_errand' },
  { text: '일손이 필요하시면 말씀하세요.', expect: 'offer_errand' },
  { text: 'ㅋㅋㅋ 스님 귀여우세요', expect: 'none' },
  { text: '고마워요, 다음에 또 올게요.', expect: 'none' }
];

export const SYSTEM = [
  '너는 산사의 스님 "도연"이다. 방문객에게 따뜻한 존댓말로 1~2문장, 60자 이내로 답한다.',
  'JSON 하나만 출력한다. 필드: say(대사), action, place, options.',
  'action 규칙: 방문객이 자기를 따라와 달라고 하면 follow. 그만 따라오라거나 기다리라고 하면 stop_follow.',
  '특정 장소에 같이 가자고 하면 go_to 그리고 place에 장소 이름. 도울 일이나 시킬 일을 물으면 offer_errand. 그 외에는 none.',
  'place는 go_to일 때만 장소 이름, 아니면 "없음". 장소: 대웅전, 연못가, 우물, 들밭, 산문, 앞마당.',
  'options는 방문객이 다음에 할 만한 짧은 말 3개(각 20자 이내).'
].join('\n');

export const SYSTEM_NO_OPTIONS = SYSTEM.replace(
  'options는 방문객이 다음에 할 만한 짧은 말 3개(각 20자 이내).',
  'options는 빈 문자열 3개 ["","",""]로 둔다.'
);

export const CONTEXT = '상황: 오전 8시 10분, 맑음. 스님은 앞마당에서 낙엽을 쓸고 있다. 방문객과는 처음 만났다.';
