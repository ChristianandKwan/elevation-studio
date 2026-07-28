-- Atomic project deletion: collects all storage paths, deletes the project row
-- (DB cascade removes elevations, elevation_options, artworks, activity_logs,
-- client_tokens, etc.), and returns the paths so the client can clean up storage.
--
-- Returning paths rather than calling storage from SQL keeps the RPC fast and
-- avoids needing pg_net / http extension. Storage removes are best-effort on
-- the client and do not affect data integrity.
--
-- Returns JSON: { elev_paths: string[], thumb_paths: string[], art_paths: string[] }

create or replace function delete_project(p_id uuid)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_elev_paths  text[];
  v_thumb_paths text[];
  v_art_paths   text[];
begin
  -- Verify the caller owns this project
  if not exists (
    select 1 from projects where id = p_id and consultant_id = auth.uid()
  ) then
    raise exception 'not found';
  end if;

  -- Collect elevation image paths
  select array_agg(eo.image_path) filter (where eo.image_path is not null)
  into v_elev_paths
  from elevation_options eo
  join elevations e on e.id = eo.elevation_id
  where e.project_id = p_id;

  -- Collect thumbnail paths
  select array_agg(eo.thumbnail_path) filter (where eo.thumbnail_path is not null)
  into v_thumb_paths
  from elevation_options eo
  join elevations e on e.id = eo.elevation_id
  where e.project_id = p_id;

  -- Collect artwork image paths
  select array_agg(a.image_path) filter (where a.image_path is not null)
  into v_art_paths
  from artworks a
  join elevation_options eo on eo.id = a.option_id
  join elevations e on e.id = eo.elevation_id
  where e.project_id = p_id;

  -- Delete the project; cascade removes all child rows
  delete from projects where id = p_id;

  return json_build_object(
    'elev_paths',  coalesce(v_elev_paths,  '{}'),
    'thumb_paths', coalesce(v_thumb_paths, '{}'),
    'art_paths',   coalesce(v_art_paths,   '{}')
  );
end;
$$;
