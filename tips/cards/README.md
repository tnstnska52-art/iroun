# 인스타 카드뉴스 (지원금 꿀팁)

하루 3개 지원금 글을 6장짜리 카드뉴스로 만들어 인스타 @irowoonsubsidy 에 올린다.

## 한 세트 구성 (6장, 1080×1350 JPG)
1. 썸네일: 후킹 문구(숫자 / 손실회피 / 상반되는 개념 / 이유·방법 중 하나), 밝은 배경, 강조 줄은 파란 띠
2~5. 본문 4장: `list`(조건 3개), `grid`(금액·사용처 4칸 + 노란 큰 숫자), `x`(못 받는 경우, 어두운 배경), `steps`(신청방법)
6. 공통 마지막 장: 팔로우 + 프로필 링크 예상 지원금 (템플릿이 자동으로 붙임)

하단 작은 글씨는 카드에 넣지 않는다. 캡션에도 "※ 출처"·"※ 정부기관 아님" 줄은 넣지 않고, 해시태그는 항상 넣는다.
좌측 상단 로고는 `tips/assets/insta-logo.jpg`(72px 원형).

## 만들기
```
cd tips/cards && npm i        # 글꼴(Jua) 설치, 처음 한 번
node tips/cards/render.mjs tips/cards/sets/<날짜>/<slug>/card.json
```
`card.json` 형식은 `sets/sample/voucher/card.json` 참고. 제목 줄 앞에 `*`를 붙이면 파란 띠 강조.
숫자·대상·기간은 글 원본(`tips/posts/*.json`)과 공고 원문에 있는 것만 쓴다. 과장 표현("무조건", "100%")은 생성기가 막는다.

## 올리기
`queue.json` 의 `items` 에 `{"set": "sets/<날짜>/<slug>", "status": "pending"}` 을 추가해 `tips-content` 에 push 하면
GitHub Actions(`.github/workflows/instagram.yml`)가 승인(Environment `instagramirowoon`) 후 2시간 30분 간격으로 최대 3개를 올리고 결과(permalink)를 queue.json 에 적는다.

- 토큰: GitHub Secret `IG_ACCESS_TOKEN` (시스템 사용자 tips-poster, 만료 없음). 저장소에 쓰지 않는다.
- 계정 ID: `config.json` 의 `ig_user_id`
- 점검만: Actions 에서 수동 실행 시 dry_run=1
