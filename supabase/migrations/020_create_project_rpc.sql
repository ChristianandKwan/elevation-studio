-- Atomic project creation: inserts project, first elevation, two options (A+B),
-- and activity log in a single transaction. Replaces the 4-step client-side
-- waterfall in DashboardClient.tsx; any failure rolls back all inserts.
--
-- Returns the new project UUID so the client can navigate to it.

create or replace function create_project(
  p_name         text,
  p_client_name  text,
  p_budget       numeric,
  p_elev_name    text,
  p_profile_name text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id   uuid;
  v_elevation_id uuid;
begin
  insert into projects (name, client_name, consultant_id, budget)
  values (p_name, p_client_name, auth.uid(), p_budget)
  returning id into v_project_id;

  insert into elevations (project_id, name, display_order)
  values (v_project_id, p_elev_name, 0)
  returning id into v_elevation_id;

  insert into elevation_options (elevation_id, option)
  values (v_elevation_id, 'A'), (v_elevation_id, 'B');

  insert into activity_logs (project_id, type, text)
  values (v_project_id, 'created', 'Project created by ' || p_profile_name);

  return v_project_id;
end;
$$;
