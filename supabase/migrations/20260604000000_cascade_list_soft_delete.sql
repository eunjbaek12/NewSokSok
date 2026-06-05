-- 고아 단어(cloud_words alive + 부모 cloud_lists deleted) 원천 차단.
--
-- 배경: 클라이언트(features/vocab/db.deleteList + features/sync/engine.cascadeSoftDelete)는
-- 이미 단어장 삭제 시 자식 word를 soft-delete + dirty 마킹해 push한다. 하지만
-- 과거 버그(cc5ebd8 이전 applyFirstLoginMerge 재발급), 부분 push, 또는 미래의
-- 어떤 클라이언트 비대칭이라도 list 삭제만 push되고 word 삭제가 누락되면 고아가
-- 생긴다. pullChanges의 orphan-skip(engine.ts)은 화면 노출만 막아줄 뿐, 클라우드에
-- 죽은 행이 쌓이는 것(용량)과 first-login 카운트 부풀림(수정 E 이전)을 막지 못한다.
--
-- 이 트리거는 cloud_lists가 alive→deleted로 전이할 때 그 자식 cloud_words를
-- 자동으로 is_deleted=true로 전파해 DB 레벨에서 부모-자식 일관성을 보장한다.
-- cloud_words의 set_updated_at_ms trigger가 updated_at을 갱신하므로, 다음
-- pull에서 클라이언트도 삭제를 정상 반영한다.

create or replace function cascade_cloud_list_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- alive→deleted 전이일 때만. 이미 살아있지 않은 자식은 건드리지 않아
  -- updated_at 불필요 재발화/무한 루프를 방지.
  if new.is_deleted = true and coalesce(old.is_deleted, false) = false then
    update cloud_words
    set is_deleted = true
    where list_id = new.id
      and is_deleted = false;
  end if;
  return new;
end;
$$;

drop trigger if exists cloud_lists_cascade_soft_delete on cloud_lists;
create trigger cloud_lists_cascade_soft_delete
  after update on cloud_lists
  for each row
  execute function cascade_cloud_list_soft_delete();
