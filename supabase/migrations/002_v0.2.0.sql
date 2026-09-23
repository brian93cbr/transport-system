-- v0.2.0：新增「預設行車時間」參數（未填預計抵達時間時使用）
insert into public.settings (key, value) values ('default_trip_minutes', '60')
  on conflict (key) do nothing;
