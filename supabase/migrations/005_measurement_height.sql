-- Allow an optional client height (inches). The 3D fit preview uses it to size the mannequin.
create or replace function public.measurement_limit(measurement_name text)
returns numrange
language sql
immutable
set search_path = public
as $$
  select case measurement_name
    when 'height' then numrange(36, 90, '[]')
    when 'bust' then numrange(18, 80, '[]')
    when 'chest' then numrange(18, 80, '[]')
    when 'waist' then numrange(15, 75, '[]')
    when 'hips' then numrange(20, 85, '[]')
    when 'shoulder' then numrange(8, 30, '[]')
    when 'armhole' then numrange(8, 40, '[]')
    when 'sleeveLength' then numrange(2, 45, '[]')
    when 'blouseLength' then numrange(8, 50, '[]')
    when 'fullLength' then numrange(20, 90, '[]')
    when 'shoulderToFloor' then numrange(25, 90, '[]')
    when 'thigh' then numrange(10, 50, '[]')
    when 'frontRise' then numrange(5, 30, '[]')
    when 'inseam' then numrange(8, 50, '[]')
    when 'outseam' then numrange(12, 60, '[]')
    when 'skirtLength' then numrange(8, 65, '[]')
    else null
  end;
$$;
