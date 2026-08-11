-- Keep the live catalog image mapping aligned with the directory assets.
-- Every factory gets a distinct visual rather than reusing a generic interior.
update public.factories
set img = case slug
  when 'F-09' then 'factory-kunshuo.jpg'
  when 'F-10' then 'factory-yilang.jpg'
  when 'F-14' then 'factory-takisada.jpg'
  when 'F-15' then 'factory-sunwell.jpg'
  when 'F-16' then 'factory-sojitz.jpg'
  when 'F-17' then 'factory-rokal.jpg'
  when 'F-18' then 'factory-miyuki.jpg'
  when 'F-19' then 'factory-toray.jpg'
  when 'F-20' then 'factory-kaihara.jpg'
  when 'F-21' then 'factory-iris.jpg'
  when 'F-22' then 'factory-ykk.jpg'
  else img
end
where slug in ('F-09', 'F-10', 'F-14', 'F-15', 'F-16', 'F-17', 'F-18', 'F-19', 'F-20', 'F-21', 'F-22');
