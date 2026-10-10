-- ============================================================================
-- TradePro CRM — Lead conversion & index seeding
-- ----------------------------------------------------------------------------
-- Helper that converts a qualified lead (status = 'won') into a client and a
-- project. Call from the API after updating a lead to 'won'.
-- Returns the newly created client and project ids.
-- ============================================================================

create or replace function public.convert_lead_to_client(p_lead_id uuid)
returns table (client_id uuid, project_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_lead    public.leads%rowtype;
  v_client_id uuid;
  v_project_id uuid;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then
    raise exception 'lead not found';
  end if;

  -- Upsert a client by (user_id, lower(email)).
  insert into public.clients (user_id, first_name, last_name, email, phone)
  values (v_lead.user_id, v_lead.first_name, v_lead.last_name, v_lead.email, v_lead.phone)
  on conflict do nothing;

  select id into v_client_id
  from public.clients
  where user_id = v_lead.user_id and lower(email) = lower(v_lead.email)
  order by created_at asc
  limit 1;

  if v_client_id is null then
    insert into public.clients (user_id, first_name, last_name, email, phone)
    values (v_lead.user_id, v_lead.first_name, v_lead.last_name, v_lead.email, v_lead.phone)
    returning id into v_client_id;
  end if;

  -- Create a project for the won lead (idempotent: skip if one already exists).
  select id into v_project_id
  from public.projects
  where user_id = v_lead.user_id and lead_id = v_lead.id
  limit 1;

  if v_project_id is null then
    insert into public.projects (user_id, client_id, lead_id, title, status, est_value, scope)
    values (
      v_lead.user_id,
      v_client_id,
      v_lead.id,
      coalesce(nullif(v_lead.first_name, '') || ' ' || v_lead.last_name, v_lead.email) || ' — ' || v_lead.service || ' job',
      'new',
      v_lead.estimated_value,
      v_lead.message
    )
    returning id into v_project_id;
  end if;

  return query select v_client_id, v_project_id;
end;
$$;

grant execute on function public.convert_lead_to_client(uuid) to authenticated;

-- ============================================================================
-- RPC endpoint to count current stats for the dashboard.
-- Expose a single function so the client can fetch stats in one round-trip.
-- ============================================================================
create or replace function public.get_dashboard_stats(owner_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_stats jsonb;
begin
  select jsonb_build_object(
    'total_leads',       (select count(*) from public.leads where user_id = owner_id),
    'new_leads',         (select count(*) from public.leads where user_id = owner_id and status = 'new'),
    'active_projects',   (select count(*) from public.projects where user_id = owner_id and status in ('new','scheduled','in_progress')),
    'completed_projects',(select count(*) from public.projects where user_id = owner_id and status = 'completed'),
    'won_leads',         (select count(*) from public.leads where user_id = owner_id and status = 'won'),
    'lost_leads',        (select count(*) from public.leads where user_id = owner_id and status = 'lost'),
    'total_clients',     (select count(*) from public.clients where user_id = owner_id),
    'emails_sent',       (select count(*) from public.email_logs where user_id = owner_id),
    'recent_leads',      coalesce((
        select jsonb_agg(x order by x.created_at desc)
        from (
          select id, first_name, last_name, email, phone, service, status, estimated_value, created_at
          from public.leads
          where user_id = owner_id
          order by created_at desc
          limit 5
        ) x), '[]'::jsonb),
    'recent_projects',   coalesce((
        select jsonb_agg(x order by x.updated_at desc)
        from (
          select p.id, p.title, p.status, p.priority, p.est_value, p.requested_date, p.scheduled_date, p.updated_at,
                 c.first_name || ' ' || c.last_name as client_name
          from public.projects p
          left join public.clients c on c.id = p.client_id
          where p.user_id = owner_id
          order by p.updated_at desc
          limit 5
        ) x), '[]'::jsonb)
  ) into v_stats;
  return v_stats;
end;
$$;

grant execute on function public.get_dashboard_stats(uuid) to authenticated;