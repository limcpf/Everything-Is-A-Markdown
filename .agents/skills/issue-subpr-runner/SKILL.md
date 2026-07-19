---
name: issue-subpr-runner
description: GitHub issue 번호를 기준으로 sub PR 개발을 순차 실행하고, 현재 세션 안에서 sub PR merge 권한을 임시로 사용해 각 sub PR의 DnD 검증, pr-review-drain, mother branch merge를 반복한 뒤 마지막 main 대상 PR은 review drain까지만 완료할 때 사용한다.
---

# issue-subpr-runner

issue `<number>`를 기준으로 sub PR 개발을 끝까지 진행한다. 이 skill은 단순 분할 계획보다 실행과 종료 판정에 초점을 둔다.

## 사용 경계

- 사용자가 이 skill을 명시 호출하면 현재 세션 동안 sub PR merge 권한이 임시 부여된 것으로 본다.
- 임시 merge 권한은 해당 issue의 mother branch로 들어가는 sub PR에만 적용한다.
- `main`, 기본 branch, release branch로 들어가는 PR은 merge하지 않는다.
- branch protection, failed checks, unresolved thread, DnD 미충족, review drain 실패를 우회하지 않는다.
- `--admin`, force push, branch 삭제는 사용자가 별도로 지시하지 않는 한 수행하지 않는다.

## 읽을 문서와 skill

1. `AGENTS.md`
2. `docs/README.md`
3. issue 본문과 댓글
4. 관련 PRD, `docs/FEATURE_REQUIREMENTS.md`, `docs/PLANS.md`, 관련 설계 문서
5. `.agents/skills/subpr-orchestrator/SKILL.md`
6. `.agents/skills/pr-review-drain/SKILL.md`

## goal 운영

1. 이 skill이 명시 호출되고 goal 도구를 사용할 수 있으면 `create_goal`로 목표를 만든다.
   - 목표 예: `issue #<number> 기준 sub PR 순차 개발: 모든 sub PR을 DnD/review drain 통과 후 mother branch에 merge하고, final main PR은 review drain까지 완료`
2. sub PR별 진행 상황은 `update_plan`으로 관리한다.
3. sub PR merge만으로 goal을 완료하지 않는다.
4. 마지막 main 대상 PR이 생성되고 `$pr-review-drain` clean 상태가 확인된 뒤에만 `update_goal complete`를 호출한다.
5. 같은 차단 조건이 반복되어 더 진행할 수 없는 경우에만 goal을 blocked로 정리하고, 어떤 sub PR에서 멈췄는지 최종 요약에 남긴다.

## workflow

1. 대상 issue와 현재 Git 상태를 확인한다.
   - `gh issue view <number> --json number,title,url,body,state,comments`
   - `git status --short --branch`
   - `gh pr list --state all --search "<number>" --json number,url,title,baseRefName,headRefName,state,isDraft`
2. mother branch와 sub PR 계획을 확정한다.
   - 기존 계획이 있으면 그대로 사용하되, 순서와 DnD를 재확인한다.
   - 계획이 없으면 `$subpr-orchestrator` 기준으로 sub PR 목록을 만든다.
   - mother branch 예: `issue-<number>-mother`
3. sub PR을 순차적으로 진행한다.
   - 다음 sub PR 시작 전 mother branch를 최신화한다.
   - sub PR branch/worktree를 만들거나 기존 branch를 이어서 사용한다.
   - issue acceptance criteria와 sub PR DnD에 맞게 구현한다.
   - 관련 테스트, lint, build, 문서 검증을 실행한다.
   - commit/push 후 PR을 생성하거나 갱신한다.
4. sub PR별 DnD를 추가 검사한다.
   - DnD 항목이 PR diff와 검증 로그로 증명되는지 확인한다.
   - 누락된 테스트, 문서, migration, hook, GitHub template 검증이 있으면 merge 전에 보강한다.
   - 사용자에게 보이는 문구, 주석, JSDoc 같은 저장소 규칙도 DnD 일부로 본다.
5. sub PR에 `$pr-review-drain`을 수행한다.
   - unresolved thread, failed/pending check, stale clean signal이 남으면 pass로 보지 않는다.
   - no-signal timeout이나 eyes timeout은 merge 근거가 아니며, 남은 리스크로 보고 멈춘다.
6. `$pr-review-drain` pass 후 sub PR을 mother branch에 merge한다.
   - base branch가 확정한 mother branch인지 다시 확인한다.
   - 최신 head SHA와 clean signal 근거를 기록한다.
   - repository 정책 또는 기존 PR 관례의 merge 방식을 따른다.
   - 관례가 불명확하면 non-admin 일반 merge를 사용하고 branch는 삭제하지 않는다.
7. merge 후 다음 sub PR로 이동한다.
   - mother branch를 pull/ff-only로 최신화한다.
   - 남은 sub PR branch가 stale이면 mother branch 기준으로 재정렬한다.
   - conflict가 생기면 해당 sub PR의 구현 단계로 돌아간다.
8. 마지막 sub PR까지 mother branch에 merge되면 main 대상 PR을 만든다.
   - base는 `main` 또는 저장소 기본 branch, head는 mother branch다.
   - issue 전체 DnD와 전체 검증을 다시 확인한다.
   - final PR에도 `$pr-review-drain`을 수행한다.
9. final main PR은 merge하지 않는다.
   - 사용자가 직접 merge할 PR URL, drain 결과, 남은 리스크를 전달한다.

## sub PR DnD 점검 템플릿

```text
Sub PR:
- PR:
- base/head:
- 목표:
- 제외 범위:
- issue acceptance criteria 연결:
- DnD:
- 변경 파일:
- 검증 명령:
- 검증 결과:
- pr-review-drain clean signal:
- unresolved thread:
- checks:
- merge 판단:
```

## merge 전 차단 조건

- PR base가 해당 issue mother branch가 아니다.
- PR이 draft이거나 closed 상태다.
- DnD 항목 중 증거가 없는 항목이 있다.
- failed, cancelled, pending, queued check가 있다.
- unresolved review thread가 있다.
- `$pr-review-drain`이 현재 head 기준 clean signal을 확인하지 못했다.
- 로컬 working tree에 의도하지 않은 변경이 있다.
- sub PR이 아니라 final main PR이다.

## 완료 기준

- goal 또는 plan에 모든 sub PR의 상태가 기록됐다.
- 각 sub PR이 DnD 재검사와 `$pr-review-drain`을 통과했다.
- 각 sub PR이 mother branch에 merge됐다.
- 마지막 main 대상 PR이 생성 또는 갱신됐다.
- 마지막 main 대상 PR도 `$pr-review-drain` clean 상태다.
- 마지막 main 대상 PR은 merge하지 않았다.
- final 요약에 사용자가 직접 merge해야 할 PR URL과 남은 리스크가 포함됐다.

## 최종 요약에 포함할 것

- issue URL
- mother branch
- sub PR 목록과 각 PR URL
- sub PR별 DnD 검사 결과
- sub PR별 `$pr-review-drain` 결과와 clean signal 근거
- sub PR별 merge 여부와 merge commit 또는 merge 시각
- 실행한 검증 명령과 결과
- final main PR URL
- final main PR `$pr-review-drain` 결과
- 사용자가 직접 merge해야 하는 대상
- goal 상태와 남은 리스크
