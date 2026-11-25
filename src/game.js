// Temporary echo game for Plan 2. Plan 3 replaces this module.
export function createGame(play) {
  const { dialogue } = play;
  const options = ['안녕하세요, 스님.', '산사를 둘러보고 있어요.', '잠시 쉬어도 될까요?'];

  play.onInteract(target => {
    if (target === 'well') {
      play.setHud('우물에 도착했습니다.');
      return;
    }
    dialogue.open('스님');
    dialogue.setNpcText('반갑습니다. 어떤 이야기를 나누고 싶으신가요?');
    dialogue.setOptions(options);
    dialogue.setStatus('입력한 말을 그대로 되돌려 드려요.');
  });
  dialogue.onSubmit(text => {
    dialogue.setNpcText(text);
    play.monk.say(text);
  });
}
