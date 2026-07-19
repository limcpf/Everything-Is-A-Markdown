---
name: pr-review-drain
description: 현재 branch 또는 지정한 PR의 리뷰 댓글, unresolved thread, checks, Codex reaction을 merge 가능 상태까지 처리할 때 사용한다.
---

# pr-review-drain

현재 branch 또는 지정한 PR의 review feedback을 Codex reaction과 함께 확인하며 merge 가능 상태까지 닫을 때 사용한다.

## 사용 조건

- PR에 Codex review comment, GitHub review, inline comment, unresolved thread가 있다.
- 리뷰 finding별로 DnD를 정의하고 수정/검증/커밋/푸시/resolve/reaction polling을 반복해야 한다.
- PR 본문 reaction 기준으로 Codex 리뷰 진행 중인지, merge 가능 상태인지 확인해야 한다.
- 리뷰 댓글을 어떻게 판단했고 어떤 실제 수정으로 닫았는지 운영 기록으로 남겨야 한다.

## Codex reaction 규칙

- PR 등록 또는 push 후 Codex가 PR 본문에 `eyes` reaction을 자동으로 달면 리뷰 진행 중으로 본다.
- Codex 리뷰 요청을 위해 `@codex review` 댓글을 남기지 않는다. 사용자가 명시한 경우에만 댓글로 요청한다.
- `eyes` reaction만 있고 새 review/comment/thread가 없으면 30초마다 다시 확인한다.
- `eyes` reaction이 남아 있어도 현재 head 이후 새 review/comment/thread가 있으면 finding 처리 루프를 우선한다.
- `+1` reaction 또는 "더 이상 major issue 없음/no major issues"에 준하는 Codex 리뷰/댓글이 있고 unresolved finding이 없으면 Codex clean signal 후보로 본다.
- clean signal은 현재 `headRefOid` 이후에 관찰된 Codex 신호여야 한다. 이전 commit에서 남은 `+1` reaction이나 오래된 clean 댓글은 merge 가능 근거로 쓰지 않는다.
- Codex `eyes`, `+1`, 현재 head 이후 review/comment/thread가 모두 없는 무반응 상태는 최대 10분만 대기한다. 10분을 넘기면 no-signal timeout으로 중단하고 남은 리스크에 기록한다.
- `eyes`가 관찰된 리뷰 진행 상태의 reaction 또는 review 대기는 push/review cycle마다 최대 30분이다. 30분을 넘기면 timeout으로 중단하고 남은 리스크에 기록한다.
- Codex는 merge를 직접 수행하지 않는다. clean signal을 확인하면 merge 가능 상태로 세션을 정리한다.

## 읽을 문서

1. `AGENTS.md`
2. `docs/README.md`
3. PR 본문
4. 관련 issue
5. 관련 PRD/FEATURE_REQUIREMENTS/PLANS/DESIGN 문서

## workflow

1. 대상 PR을 찾는다.
   - 현재 branch 기준: `gh pr view --json number,url,baseRefName,headRefName,headRefOid,state`
   - 지정 PR이 있으면 해당 PR을 사용한다.
2. 리뷰 입력을 모두 수집한다.
   - 현재 `headRefOid`
   - PR 본문 reactions
   - review comments
   - reviews
   - review threads
   - 일반 PR comments
   - GitHub checks
3. 최신성 기준을 잡는다.
   - clean signal과 finding은 현재 `headRefOid` 이후 생성/갱신된 Codex review/comment/thread를 우선한다.
   - PR 본문 reaction은 head SHA에 직접 묶이지 않으므로, 새 push 이후 다시 관찰한 `eyes` 대기 종료 또는 현재 head 이후 Codex no-major-issues 리뷰/댓글과 함께 있을 때만 clean 근거로 쓴다.
   - 작성자가 Codex가 아닌 review/comment의 no-major-issues 문구는 clean signal로 쓰지 않는다.
4. Codex reaction과 리뷰 입력 상태를 판단한다.
   - 현재 head 이후 새 review/comment/thread가 있으면 `eyes` 유무와 관계없이 finding 처리 루프를 우선한다.
   - `eyes`만 있고 새 review/comment/thread가 없으면 리뷰 진행 중이다. 30초 대기 후 다시 2번부터 확인한다.
   - `+1` 또는 Codex의 "더 이상 major issue 없음/no major issues"류 메시지는 clean signal 후보이다.
   - reaction 없음: review/comment/thread/check 상태를 보고 계속 진행하거나 30초 대기한다.
   - `eyes`, `+1`, 현재 head 이후 Codex review/comment/thread가 모두 없으면 무반응 상태로 보고 최대 10분만 대기한다.
   - `eyes`가 관찰된 reaction/review 대기 시간은 push/review cycle마다 30분을 넘기지 않는다.
5. GitHub checks 상태를 판단한다.
   - failed 또는 cancelled check가 있으면 clean이 아니며 finding 또는 남은 리스크로 처리한다.
   - pending 또는 queued check가 있으면 30초마다 polling한다.
   - skipped 또는 neutral check는 실패로 보지 않되 최종 요약에 기록한다.
6. finding을 정규화한다.
   - 중복 comment를 묶는다.
   - 이미 해결된 comment와 unresolved thread를 구분한다.
   - 각 finding에 severity, 파일, 근거, DnD를 붙인다.
7. 수정 계획을 세운다.
   - P1/P2/P3 또는 merge-blocking finding을 먼저 처리한다.
   - 스타일 취향보다 버그, 회귀, 위험한 가정, 누락 검증을 우선한다.
8. 필요한 코드/문서/test를 수정한다.
9. 검증을 실행한다.
   - PR 본문의 검증 명령
   - 관련 테스트
   - 기본 `./scripts/verify`
10. commit/push한다.
11. 해결된 thread를 resolve한다.
    - resolve 실패는 clean으로 보지 않는다.
    - 권한 또는 GraphQL 오류로 resolve하지 못하면 실패한 thread를 최종 요약의 남은 리스크와 사용자 수동 처리 항목에 기록한다.
12. 재검토를 기다린다.
    - 별도 `@codex review` 댓글을 남기지 않는다.
    - Codex가 자동으로 `eyes` reaction을 달거나 review를 남길 때까지 30초마다 polling한다.
    - `eyes`가 남아 있어도 현재 head 이후 review가 달렸으면 2번부터 반복한다.
    - `+1` reaction 또는 "더 이상 major issue 없음/no major issues"류 리뷰/댓글이 확인되면 clean signal 확인으로 넘어간다.
    - `eyes`, `+1`, 현재 head 이후 Codex review/comment/thread가 모두 없는 무반응 상태가 10분을 넘기면 no-signal timeout으로 중단하고 최종 요약에 남긴다.
    - `eyes`가 관찰된 리뷰 진행 상태가 30분을 넘기면 timeout으로 중단하고 최종 요약에 남긴다.
13. clean signal을 확인한다.
    - unresolved thread 없음
    - GitHub checks pass
    - Codex가 현재 head 기준으로 신뢰 가능한 `+1` reaction 또는 "더 이상 major issue 없음/no major issues"에 준하는 리뷰/댓글을 남김
    - 로컬 working tree clean
14. 리뷰 처리 보고서를 생성하거나 갱신한다.
    - 저장 위치: `~/vaults/99_운영/seemirai-reviews/PR-<pr-number>.md`
    - 디렉터리가 없으면 생성한다.
    - 리뷰 댓글 원문 요지, 판단, 실제 수정 내용, 검증 결과, thread resolve 상태, clean signal 근거를 한 문서에 모은다.
    - 여러 push/review cycle이 있으면 cycle별로 finding을 묶고, 같은 finding이 재발하거나 보강된 경우 연결 관계를 남긴다.
    - 보고서 생성에 실패하면 clean 완료로 보지 않고 최종 요약의 남은 리스크와 수동 처리 항목에 기록한다.

## GitHub 명령 힌트

```sh
gh pr view --json number,url,baseRefName,headRefName,headRefOid,state,reviewDecision
gh pr checks
gh api --paginate repos/:owner/:repo/issues/<pr-number>/reactions -H "Accept: application/vnd.github+json"
gh api repos/:owner/:repo/pulls/<pr-number>/comments
gh api repos/:owner/:repo/pulls/<pr-number>/reviews
gh api graphql -f query='query { ... }'
```

PR 본문 reaction 조회 결과는 `--paginate`로 모두 조회하고, `content` 값이 `eyes`면 리뷰 진행 중, `+1`이면 Codex clean signal 후보로 판단한다.
reaction과 review/comment는 작성자 또는 app이 Codex인지 확인한다.
review/comment 본문에 "더 이상 major issue 없음/no major issues"에 준하는 Codex 메시지가 있어도 clean signal 후보로 판단하되, 현재 head 이후 신호만 인정한다.
GraphQL thread 조회는 저장소와 PR 번호에 맞춰 reviewThreads를 요청한다.

## DnD 템플릿

```text
Finding:
- 근거:
- 영향:
- 수정 범위:
- 완료 조건:
- 검증 명령:
```

## 리뷰 처리 보고서 템플릿

보고서는 PR 번호별 단일 Markdown 파일로 관리한다. 파일명은 `PR-<pr-number>.md`를 사용한다.

```markdown
# PR #<number> 리뷰 처리 보고서

- PR: <url>
- base/head: `<base>` ← `<head>`
- 최종 head SHA: `<sha>`
- 최종 상태: <merge state/check/reaction/thread 요약>
- 작성 시각: <ISO 또는 로컬 시각>

## 처리 요약

- 처리한 finding 수:
- resolved thread 수:
- Codex clean signal:
- 남은 리스크:

## 리뷰 댓글별 처리

### Finding <n>. <제목>

- 리뷰 댓글:
  - 작성자:
  - 생성 시각:
  - 위치:
  - thread:
  - URL:
  - 원문 요지:
- 판단:
  - 심각도:
  - 수용 여부:
  - 판단 근거:
  - DnD:
- 실제 수정:
  - 변경 파일:
  - 구현 내용:
  - 추가/수정 테스트:
  - 커밋:
- 검증:
  - 실행 명령:
  - 결과:
- 종료 상태:
  - thread resolve:
  - 후속 Codex 신호:

## 검증 로그 요약

## 남은 리스크와 후속 작업
```

## 완료 기준

- unresolved thread가 없다.
- GitHub checks가 pass다.
- failed/cancelled/pending check가 없다.
- 현재 head 기준으로 신뢰 가능한 Codex `+1` reaction 또는 "더 이상 major issue 없음/no major issues"에 준하는 Codex 리뷰/댓글 clean signal이 있다.
- 로컬 working tree가 clean이다.
- 수정 commit이 push됐다.
- `~/vaults/99_운영/seemirai-reviews/PR-<pr-number>.md` 보고서가 생성 또는 갱신됐다.
- 무반응 상태의 reaction/review polling이 10분 안에 완료됐거나, no-signal timeout이 남은 리스크로 기록됐다.
- `eyes`가 관찰된 리뷰 진행 상태의 reaction/review polling이 push/review cycle별 30분 안에 완료됐거나, timeout이 남은 리스크로 기록됐다.
- resolve 실패 thread가 없다.
- 처리한 finding과 남은 리스크가 최종 요약에 포함됐다.

## 최종 요약에 포함할 것

- PR URL
- base/head
- 처리한 finding
- 실행한 검증 명령과 결과
- resolve한 thread 수
- 마지막 Codex reaction 상태
- 현재 head SHA와 clean signal 최신성 근거
- Codex clean signal 근거: `+1` reaction 또는 no-major-issues 리뷰/댓글
- polling 대기 시간
- timeout 여부와 종류: no-signal 10분 timeout 또는 eyes 진행 30분 timeout
- skipped/neutral check 목록
- resolve 실패 thread와 수동 처리 필요 여부
- 리뷰 처리 보고서 경로
- merge 가능 여부
- 남은 리스크
